import panel as pn
import pandas as pd
from bokeh.plotting import figure
from bokeh.models import ColumnDataSource, HoverTool, DatetimeTickFormatter


def update_data(event, date_start, date_end, occurrences_by_date, source, total_occurrences_pane,
                      min_occurrences_pane, max_occurrences_pane, average_occurrences_pane, p):
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
                          max_occurrences_pane, average_occurrences_pane)


def update_statistics(filtered_occurrences, total_occurrences_pane, min_occurrences_pane,
                      max_occurrences_pane, average_occurrences_pane):
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


def create_tab1_content(data):
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

    # Find the date with the highest number of published articles
    max_occurrences_date = occurrences_by_date.loc[occurrences_by_date["count"].idxmax(), "publication_date"]
    max_occurrences_count = occurrences_by_date["count"].max()

    # Find the date with the lowest number of published articles
    min_occurrences_date = occurrences_by_date.loc[occurrences_by_date["count"].idxmin(), "publication_date"]
    min_occurrences_count = occurrences_by_date["count"].min()

    # Calculate the total number of articles
    total_articles = occurrences_by_date["count"].sum()

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
                                                     max_occurrences_pane, average_occurrences_pane, p), "value")
    date_end.param.watch(lambda event: update_data(event, date_start, date_end, occurrences_by_date, source,
                                                   total_occurrences_pane, min_occurrences_pane,
                                                   max_occurrences_pane, average_occurrences_pane, p), "value")

    update_statistics(occurrences_by_date, total_occurrences_pane, min_occurrences_pane,
                      max_occurrences_pane, average_occurrences_pane)

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
    )