import panel as pn
import pandas as pd
from bokeh.plotting import figure
from bokeh.models import ColumnDataSource, HoverTool, DatetimeTickFormatter
from bokeh.layouts import column, row


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
data = pd.read_csv(csv_file)
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