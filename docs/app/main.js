importScripts("https://cdn.jsdelivr.net/pyodide/v0.23.0/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['markdown-it-py<3', 'https://cdn.holoviz.org/panel/1.1.0/dist/wheels/bokeh-3.1.1-py3-none-any.whl', 'https://cdn.holoviz.org/panel/1.1.0/dist/wheels/panel-1.1.0-py3-none-any.whl', 'pyodide-http==0.2.1', 'pandas', 'urllib']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

import panel as pn
import pandas as pd
from bokeh.plotting import figure
from bokeh.models import ColumnDataSource, HoverTool, DatetimeTickFormatter
from bokeh.layouts import column, row
import urllib


def update_data(event):
    start, end = pd.Timestamp(date_start.value), pd.Timestamp(date_end.value)

    if start > end:
        date_end.value = date_start.value
    else:
        filtered_occurrences = occurrences_by_date[
            (pd.to_datetime(occurrences_by_date["publication_date"]) >= start) &
            (pd.to_datetime(occurrences_by_date["publication_date"]) <= end)
            ]
        source.data = dict(
            publication_date=pd.to_datetime(filtered_occurrences["publication_date"]),
            count=filtered_occurrences["count"]
        )

        p.x_range.start = filtered_occurrences["publication_date"].min()
        p.x_range.end = filtered_occurrences["publication_date"].max()


pn.extension()


csv_file = "extended_dataset.csv"
try:
    data = pd.read_csv(csv_file)
except FileNotFoundError:
    csv_url = "https://raw.githubusercontent.com/Rombeii/CNN-news-dashboard/main/extended_dataset.csv"
    data = pd.read_csv(csv_url)
filtered_data = data.copy()

# Filter out rows with unknown publication dates
filtered_data = filtered_data[filtered_data["publication_date"] != "Unknown"]

# Convert publication_date column in filtered_data to datetime
filtered_data["publication_date"] = pd.to_datetime(filtered_data["publication_date"], errors="coerce").dt.date

# Group by publication date and count occurrences
occurrences_by_date = filtered_data.groupby("publication_date").size().reset_index(name="count")

# Create a complete range of dates
date_range = pd.date_range(start=filtered_data["publication_date"].min(), end=filtered_data["publication_date"].max(), freq="D")

# Create a DataFrame with all dates
all_dates = pd.DataFrame({"publication_date": date_range})

# Convert publication_date column in all_dates to date
all_dates["publication_date"] = pd.to_datetime(all_dates["publication_date"]).dt.date

# Merge occurrences_by_date with all_dates using merge
occurrences_by_date = all_dates.merge(occurrences_by_date, on="publication_date", how="left")
occurrences_by_date["count"] = occurrences_by_date["count"].fillna(0)

# Find the date with the highest number of published articles
max_occurrences_date = occurrences_by_date.loc[occurrences_by_date["count"].idxmax(), "publication_date"]
max_occurrences_count = occurrences_by_date["count"].max()

# Find the date with the lowest number of published articles
min_occurrences_date = occurrences_by_date.loc[occurrences_by_date["count"].idxmin(), "publication_date"]
min_occurrences_count = occurrences_by_date["count"].min()

# Calculate the total number of articles
total_articles = occurrences_by_date["count"].sum()

date_start = pn.widgets.DateSlider(name='Start Date', start=filtered_data["publication_date"].min(),
                                   end=filtered_data["publication_date"].max(), value=filtered_data["publication_date"].min())
date_end = pn.widgets.DateSlider(name='End Date', start=filtered_data["publication_date"].min(),
                                 end=filtered_data["publication_date"].max(), value=filtered_data["publication_date"].max())

date_start.param.watch(update_data, "value")
date_end.param.watch(update_data, "value")

p = figure(title="Occurrences by Date", x_axis_label='Date', y_axis_label='Occurrences')
source = ColumnDataSource(occurrences_by_date)
p.line(x='publication_date', y='count', source=source, line_width=2)
p.xaxis.formatter = DatetimeTickFormatter()

hover_tool = HoverTool(tooltips=[("Publications", "@count")])
p.add_tools(hover_tool)

chart = pn.pane.Bokeh(p)
layout = pn.Column(
    pn.Row(date_start),
    pn.Row(date_end),
    pn.Row(chart)
)

if __name__.startswith("bokeh"):
    # Start with: panel serve script.py
    app = layout.servable()
    app.show(port=5007)


await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.globals.set('patch', msg.patch)
    self.pyodide.runPythonAsync(`
    state.curdoc.apply_json_patch(patch.to_py(), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.globals.set('location', msg.location)
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads(location)
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()