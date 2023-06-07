import panel as pn
import pandas as pd
from bokeh.plotting import figure
from bokeh.models import ColumnDataSource, HoverTool, DatetimeTickFormatter
from bokeh.models import HTMLTemplateFormatter


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
    articles_with_city = data[data['city'] != 'Unknown'].shape[0]
    articles_with_state = data[data['state'] != 'Unknown'].shape[0]
    articles_with_country = data[data['country'] != 'Unknown'].shape[0]

    # Create a DataFrame to display the descriptors
    summary_data = pd.DataFrame({
        'Descriptor': ['Total Articles', 'Articles with Publication Date'] +
                      [f'{topic.capitalize()} related topic' for topic in topic_categories] +
                      ['Articles with City', 'Articles with State', 'Articles with Country'],
        'Value': [total_articles, articles_with_publication_date] + articles_per_topic +
                 [articles_with_city, articles_with_state, articles_with_country],
        'Percentage': ['100%', f'{percentage_with_publication_date:.2f}%'] +
                      [f'{(articles / total_articles) * 100:.2f}%' for articles in articles_per_topic] +
                      [f'{(articles / total_articles) * 100:.2f}%' for articles in
                       [articles_with_city, articles_with_state, articles_with_country]]
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




pn.extension(sizing_mode="stretch_width", template="fast")

csv_file = "extended_dataset.csv"
try:
    data = pd.read_csv(csv_file)
except FileNotFoundError:
    csv_url = "https://raw.githubusercontent.com/Rombeii/CNN-news-dashboard/main/extended_dataset.csv"
    data = pd.read_csv(csv_url)


tab2_content = pn.pane.Markdown("Content for Tab 2")  # Placeholder content for Tab 2


tabs = pn.Tabs(
    ("Summary", create_summary_layout()),
    ("Date published", create_date_layout()),
)

# For development purposes
# if __name__.startswith("bokeh"):
#     # Start with: panel serve main.py --show
#     app = tabs.servable()
#     app.show(port=5007)

app = tabs.servable()
