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
  const env_spec = ['markdown-it-py<3', 'https://cdn.holoviz.org/panel/1.1.0/dist/wheels/bokeh-3.1.1-py3-none-any.whl', 'https://cdn.holoviz.org/panel/1.1.0/dist/wheels/panel-1.1.0-py3-none-any.whl', 'pyodide-http==0.2.1', 'folium', 'pandas']
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

from math import pi

import panel as pn
import pandas as pd
from bokeh.models import ColumnDataSource, HoverTool, DatetimeTickFormatter, NumeralTickFormatter, Whisker
from bokeh.plotting import figure
from bokeh.palettes import Category10
from bokeh.transform import cumsum, factor_cmap
from folium import folium
from panel.widgets import CheckButtonGroup


def update_data(event, date_start, date_end, occurrences_by_date, source, total_occurrences_pane,
                      min_occurrences_pane, max_occurrences_pane, average_occurrences_pane, p, data_table):
    start, end = pd.Timestamp(date_start.value), pd.Timestamp(date_end.value)

    if start > end:
        date_start.value, date_end.value = date_end.value, date_start.value
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

        update_statistics(filtered_occurrences, total_occurrences_pane, min_occurrences_pane,
                          max_occurrences_pane, average_occurrences_pane, data_table)


def update_statistics(filtered_occurrences, total_occurrences_pane, min_occurrences_pane,
                      max_occurrences_pane, average_occurrences_pane, data_table):
    total_articles = filtered_occurrences["count"].sum()
    min_articles = filtered_occurrences["count"].min()
    min_articles_date = filtered_occurrences.loc[filtered_occurrences["count"].idxmin(), "publication_date"]
    max_articles = filtered_occurrences["count"].max()
    max_articles_date = filtered_occurrences.loc[filtered_occurrences["count"].idxmax(), "publication_date"]
    avg_articles = filtered_occurrences["count"].mean()

    total_occurrences_pane.object = f"**Total Published Articles:** {total_articles}"
    min_occurrences_pane.object = f"**Minimum Published Articles:** {min_articles} (Date: {min_articles_date})"
    max_occurrences_pane.object = f"**Maximum Published Articles:** {max_articles} (Date: {max_articles_date})"
    average_occurrences_pane.object = f"**Average Published Articles:** {avg_articles:.2f}"

    data_table.value = filtered_occurrences


def create_date_layout():
    filtered_data = data.copy()

    # Filter out rows with unknown publication dates
    filtered_data = filtered_data[filtered_data["publication_date"] != "Unknown"]

    # Convert publication_date column in filtered_data to datetime
    filtered_data["publication_date"] = pd.to_datetime(filtered_data["publication_date"], errors="coerce").dt.date

    # Group by publication date and count occurrences
    occurrences_by_date = filtered_data.groupby("publication_date").size().reset_index(name="count")

    # Create a complete range of dates
    date_range = pd.date_range(start=filtered_data["publication_date"].min(),
                               end=filtered_data["publication_date"].max(), freq="D")

    # Create a DataFrame with all dates
    all_dates = pd.DataFrame({"publication_date": date_range})

    # Convert publication_date column in all_dates to date
    all_dates["publication_date"] = pd.to_datetime(all_dates["publication_date"]).dt.date

    # Merge occurrences_by_date with all_dates using merge
    occurrences_by_date = all_dates.merge(occurrences_by_date, on="publication_date", how="left")
    occurrences_by_date["count"] = occurrences_by_date["count"].fillna(0)

    date_start = pn.widgets.DateSlider(name='Start Date', start=filtered_data["publication_date"].min(),
                                       end=filtered_data["publication_date"].max(),
                                       value=filtered_data["publication_date"].min())
    date_end = pn.widgets.DateSlider(name='End Date', start=filtered_data["publication_date"].min(),
                                     end=filtered_data["publication_date"].max(),
                                     value=filtered_data["publication_date"].max())

    p = figure(title="Number of Published Articles by Date", x_axis_label='Date',
               y_axis_label='Number of Published Articles', width=800, height=400)
    source = ColumnDataSource(occurrences_by_date)
    p.line(x='publication_date', y='count', source=source, line_width=2)
    p.xaxis.formatter = DatetimeTickFormatter()

    hover_tool = HoverTool(tooltips=[("Date", "@publication_date{%F}"), ("Number of Articles", "@count")],
                           formatters={"@publication_date": "datetime"})

    p.add_tools(hover_tool)

    total_occurrences_pane = pn.pane.Markdown()
    min_occurrences_pane = pn.pane.Markdown()
    max_occurrences_pane = pn.pane.Markdown()
    average_occurrences_pane = pn.pane.Markdown()

    date_start.param.watch(lambda event: update_data(event, date_start, date_end, occurrences_by_date, source,
                                                     total_occurrences_pane, min_occurrences_pane,
                                                     max_occurrences_pane, average_occurrences_pane, p, data_table), "value")
    date_end.param.watch(lambda event: update_data(event, date_start, date_end, occurrences_by_date, source,
                                                   total_occurrences_pane, min_occurrences_pane,
                                                   max_occurrences_pane, average_occurrences_pane, p, data_table), "value")

    data_table = pn.widgets.DataFrame(filtered_data, height=600, sortable=True, show_index=False)

    update_statistics(occurrences_by_date, total_occurrences_pane, min_occurrences_pane,
                      max_occurrences_pane, average_occurrences_pane, data_table)

    chart = pn.pane.Bokeh(p, sizing_mode="stretch_width")
    statistics = pn.Column(
        pn.Row(total_occurrences_pane),
        pn.Row(min_occurrences_pane),
        pn.Row(max_occurrences_pane),
        pn.Row(average_occurrences_pane),
    )

    return pn.Column(
        pn.Row(date_start, date_end),
        pn.Row(chart, statistics),
        pn.Row(data_table)
    )


def create_summary_layout():
    # Calculate the desired descriptors based on the dataset
    total_articles = len(data)
    topic_categories = ['business', 'sport', 'tech', 'politics', 'entertainment']
    articles_per_topic = [data[data['topic'] == topic].shape[0] for topic in topic_categories]
    articles_with_publication_date = data[data['publication_date'] != 'Unknown'].shape[0]
    percentage_with_publication_date = (articles_with_publication_date / total_articles) * 100

    # Calculate the count of non-'Unknown' values for city, state, and country columns
    articles_with_location = data[(data['city'] != 'Unknown') | (data['state'] != 'Unknown')
                                  | (data['country'] != 'Unknown')].shape[0]
    articles_with_city = data[data['city'] != 'Unknown'].shape[0]
    articles_with_state = data[data['state'] != 'Unknown'].shape[0]
    articles_with_country = data[data['country'] != 'Unknown'].shape[0]

    # Create a DataFrame to display the descriptors
    summary_data = pd.DataFrame({
        'Descriptor': ['Total Articles', 'Articles with Publication Date'] +
                      [f'{topic.capitalize()} related topic' for topic in topic_categories] +
                      ['Articles with Location', 'Articles with City', 'Articles with State', 'Articles with Country'],
        'Value': [total_articles, articles_with_publication_date] + articles_per_topic +
                 [articles_with_location, articles_with_city, articles_with_state, articles_with_country],
        'Percentage': ['100%', f'{percentage_with_publication_date:.2f}%'] +
                      [f'{(articles / total_articles) * 100:.2f}%' for articles in articles_per_topic] +
                      [f'{(articles / total_articles) * 100:.2f}%' for articles in
                       [articles_with_location, articles_with_city, articles_with_state, articles_with_country]]
    })

    # Create a DataFrame widget to render the summary data
    summary_widget = pn.widgets.DataFrame(summary_data, fit_columns=True, show_index=False, height=450)

    # Create a DataFrame widget to display all the data
    all_data_widget = pn.widgets.DataFrame(data, fit_columns=True, show_index=False)

    # Create the layout for the second tab
    content = pn.Column(
        pn.pane.Markdown("## Summary of Data"),
        summary_widget,
        pn.pane.Markdown("## All Data"),
        all_data_widget
    )

    return content


def create_line_plot(data):
    # Filter out rows with 'Unknown' publication dates
    data = data[data['publication_date'] != 'Unknown']

    # Convert publication dates to date format
    data['publication_date'] = pd.to_datetime(data['publication_date'], format="%Y-%m-%d %H:%M").dt.date

    # Group the data by topic and publication date, and calculate average sentiment score
    grouped_data = data.groupby(['topic', 'publication_date'])['sentiment_score'].mean().reset_index()

    # Sort the data by publication date
    grouped_data = grouped_data.sort_values('publication_date')

    # Create a Bokeh figure for the line plot
    line_plot = figure(height=500, title="Average Sentiment Score Over Time", x_axis_type='datetime',
                       toolbar_location=None, sizing_mode='stretch_width')

    # Create a new column for smoothed sentiment scores
    grouped_data['smoothed_sentiment'] = grouped_data.groupby('topic')['sentiment_score'].\
        rolling(window=100, center=True).mean().reset_index(0, drop=True)

    # Get unique topics
    topics = grouped_data['topic'].unique()

    # Color palette for the lines
    color_palette = Category10[max(3, len(topics))]

    # Add a line glyph for each topic to the line plot
    lines = []
    for i, topic in enumerate(topics):
        topic_data = grouped_data[grouped_data['topic'] == topic]
        line_data = ColumnDataSource(topic_data)  # Create ColumnDataSource for the selected topic data

        line = line_plot.line(x='publication_date', y='smoothed_sentiment', source=line_data, line_color=color_palette[i],
                              legend_label=topic, line_width=2, alpha=0.8)
        lines.append(line)

    # Set up plot properties
    line_plot.xaxis.axis_label = 'Publication Date'
    line_plot.yaxis.axis_label = 'Average Sentiment Score'
    line_plot.legend.title = 'Topics'
    line_plot.legend.location = 'top_left'
    line_plot.yaxis.formatter = NumeralTickFormatter(format="0.00") # Format y-axis ticks as two decimal places

    # Create CheckboxGroup for topic selection
    topic_selection = CheckButtonGroup(options=topics.tolist(),
                                       value=topics.tolist())

    # Create a callback function to toggle the visibility of lines based on the selected topics
    def update_lines(event, param):
        for i, (line, topic) in enumerate(zip(lines, topics)):
            line.visible = topic in param

    # Use the watch function to update the plot when the selection changes
    topic_selection.param.watch(lambda event: update_lines(event, topic_selection.value), 'value')


    # Combine the line plot and the topic selection into a layout
    layout = pn.Column(topic_selection, line_plot)

    return layout


def create_box_plot(data):
    qs = data.groupby("topic")['sentiment_score'].quantile([0.25, 0.5, 0.75])
    qs = qs.unstack().reset_index()
    qs.columns = ["topic", "q1", "q2", "q3"]
    data = pd.merge(data, qs, on="topic", how="left")

    # Calculate IQR outlier bounds
    iqr = data.q3 - data.q1
    data["upper"] = data.q3 + 1.5 * iqr
    data["lower"] = data.q1 - 1.5 * iqr

    source = ColumnDataSource(data)

    p = figure(x_range=data.topic.unique(), tools="", toolbar_location=None,
               title="Sentiment Score Distribution by Topic",
               background_fill_color="#eaefef", y_axis_label="Sentiment Score")

    # Outlier range
    whisker = Whisker(base="topic", upper="upper", lower="lower", source=source)
    whisker.upper_head.size = whisker.lower_head.size = 20
    p.add_layout(whisker)

    # Quantile boxes
    cmap = factor_cmap("topic", "TolRainbow7", data.topic.unique())
    p.vbar("topic", 0.7, "q2", "q3", source=source, color=cmap, line_color="black")
    p.vbar("topic", 0.7, "q1", "q2", source=source, color=cmap, line_color="black")

    # Outliers
    outliers = data[~data.sentiment_score.between(data.lower, data.upper)]
    p.scatter("topic", "sentiment_score", source=outliers, size=6, color="black", alpha=0.3)

    p.xgrid.grid_line_color = None
    p.axis.major_label_text_font_size = "14px"
    p.axis.axis_label_text_font_size = "12px"

    return p


def create_topics_layout():
    # Calculate the count of articles per topic
    topic_counts = data['topic'].value_counts()

    # Calculate the average sentiment score per topic
    topic_sentiment = data.groupby('topic')['sentiment_score'].mean()

    # Create a temporary DataFrame with topics, counts, and average sentiment scores
    topics_data = pd.DataFrame({'topic': topic_counts.index, 'count': topic_counts.values,
                                'sentiment': topic_sentiment.values})

    # Calculate the angles and colors for the pie chart
    topics_data['angle'] = topics_data['count'] / topics_data['count'].sum() * 2 * pi
    topics_data['percentage'] = topics_data['count'] / topics_data['count'].sum() * 100
    topics_data['color'] = Category10[len(topics_data)]

    # Create a Bokeh figure for the pie chart
    pie_chart_plot = figure(height=500, title="Pie Chart", toolbar_location=None,
               tools="hover", tooltips="@topic: @percentage{0.0}%", x_range=(-0.5, 1.0))

    # Create the wedge glyph for the pie chart
    pie_chart_plot.wedge(x=0, y=1, radius=0.4,
                start_angle=cumsum('angle', include_zero=True), end_angle=cumsum('angle'),
                line_color="white", fill_color='color', legend_field='topic', source=topics_data)

    # Set up the plot properties
    pie_chart_plot.axis.axis_label = None
    pie_chart_plot.axis.visible = False
    pie_chart_plot.grid.grid_line_color = None

    # Create a Bokeh figure for the bar chart
    bar_plot = figure(height=500, title="Average Sentiment Score", x_range=topics_data['topic'],
                toolbar_location=None, tooltips="@topic: @sentiment{0.00}", sizing_mode='stretch_width')

    # Create the bar glyph for the bar chart
    bar_plot.vbar(x='topic', top='sentiment', width=0.8, color='color', legend_field='topic', source=topics_data)

    # Set up the plot properties
    bar_plot.xgrid.grid_line_color = None
    bar_plot.y_range.start = topics_data['sentiment'].min() - 0.1
    bar_plot.yaxis.axis_label = 'Average Sentiment Score'
    bar_plot.legend.location = "top_left"

    # Convert the Bokeh plots to Panel objects
    pie_chart_pane = pn.pane.Bokeh(pie_chart_plot)
    bar_plot_pane = pn.pane.Bokeh(bar_plot)

    # Create the layout for the third tab
    content = pn.Column(pn.Row(
        pie_chart_pane,
        bar_plot_pane, create_box_plot(data)),
        create_line_plot(data)
    )

    return content


def create_state_layout():
    # Filter the data based on the condition
    filtered_data = data[(data['city'] != 'Unknown') | (data['state'] != 'Unknown') | (data['country'] != 'Unknown')]

    # Select the desired columns
    filtered_data = filtered_data[['city', 'state', 'country']]

    # Read the 'us-states.json' file
    us_states = pd.read_json('https://raw.githubusercontent.com/python-visualization/folium/main/tests/us-states.json')

    filtered_data['state'] = filtered_data['state'].str.title()

    # Filter out rows where the state is not in the 'us-states.json' file
    filtered_data = filtered_data[
        filtered_data['state'].isin(us_states['features'].apply(lambda x: x['properties']['name']))]

    # Calculate the count of articles per state
    state_counts = filtered_data[filtered_data['state'] != 'Unknown']
    state_counts = state_counts['state'].value_counts().reset_index()
    state_counts.columns = ['state', 'count']

    # Create a DataFrame widget to display the filtered data
    filtered_data_widget = pn.widgets.DataFrame(state_counts, fit_columns=True, show_index=False)

    # Create a folium map centered on the US
    state_map = folium.Map(location=[48, -102], zoom_start=3)

    # Create a choropleth map layer using the state counts
    state_map.choropleth(
                   geo_data='https://raw.githubusercontent.com/python-visualization/folium/main/tests/us-states.json',
                   data=state_counts,
                   columns=['state', 'count'],
                   highlight=True,
                   key_on='feature.properties.name',
                   legend_name='Number of articles published',
    )

    folium_pane = pn.pane.plot.Folium(state_map, height=400)

    # Create the layout for the tab
    content = pn.Column(
        folium_pane,
        filtered_data_widget,
    )

    return content


def create_country_layout():
    # Filter the data based on the condition
    filtered_data = data[(data['city'] != 'Unknown') | (data['state'] != 'Unknown') | (data['country'] != 'Unknown')]

    # Select the desired columns
    filtered_data = filtered_data[['city', 'state', 'country']]

    # Read the 'us-states.json' file
    us_states = pd.read_json('https://raw.githubusercontent.com/python-visualization/folium/main/tests/us-states.json')

    filtered_data['state'] = filtered_data['state'].str.title()
    filtered_data['country'] = filtered_data['country'].str.title()

    # Filter out rows where the state is not in the 'us-states.json' file
    filtered_data = filtered_data[ (filtered_data['state'] == 'Unknown') |
                                   (filtered_data['state'].isin(us_states['features']
                                                                .apply(lambda x: x['properties']['name'])))]

    # Replace the country with 'United States of America'
    filtered_data.loc[filtered_data['state'] != 'Unknown', 'country'] = 'United States of America'

    # Calculate the count of articles per state
    country_counts = filtered_data[filtered_data['country'] != 'Unknown']
    country_counts = country_counts['country'].value_counts().reset_index()
    country_counts.columns = ['country', 'count']

    # Create a DataFrame widget to display the filtered data
    filtered_data_widget = pn.widgets.DataFrame(country_counts, fit_columns=True, show_index=False)

    # Create a folium map centered on the US
    country_map = folium.Map(location=(30, 10), zoom_start=3, tiles="cartodb positron")

    # Create a choropleth map layer using the state counts
    country_map.choropleth(
                   geo_data='https://raw.githubusercontent.com/python-visualization/folium/main/examples/data/world-countries.json',
                   data=country_counts,
                   columns=['country', 'count'],
                   highlight=True,
                   key_on='feature.properties.name',
                   legend_name='Number of articles published',
    )

    folium_pane = pn.pane.plot.Folium(country_map, height=400)

    # Create the layout for the tab
    content = pn.Column(
        folium_pane,
        filtered_data_widget,
    )

    return content


pn.extension(sizing_mode="stretch_width", template="fast")

csv_file = "extended_dataset.csv"
try:
    data = pd.read_csv(csv_file)
except FileNotFoundError:
    csv_url = "https://raw.githubusercontent.com/Rombeii/CNN-news-dashboard/main/extended_dataset.csv"
    data = pd.read_csv(csv_url)

tabs = pn.Tabs(
    ("Summary", create_summary_layout()),
    ("Date published", create_date_layout()),
    ("Topics and sentiments", create_topics_layout()),
    ("States", create_state_layout()),
    ("Countries", create_country_layout()),
)

# For development purposes
# if __name__.startswith("bokeh"):
#     # Start with: panel serve main.py --show
#     app = tabs.servable()
#     app.show(port=5007)

app = tabs.servable()


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