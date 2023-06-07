import panel as pn
import pandas as pd
from bokeh.plotting import figure
from bokeh.models import ColumnDataSource, HoverTool, DatetimeTickFormatter

from dateLayout import create_tab1_content

pn.extension(sizing_mode="stretch_width", template="fast")


csv_file = "extended_dataset.csv"
try:
    data = pd.read_csv(csv_file)
except FileNotFoundError:
    csv_url = "https://raw.githubusercontent.com/Rombeii/CNN-news-dashboard/main/extended_dataset.csv"
    data = pd.read_csv(csv_url)


tab2_content = pn.pane.Markdown("Content for Tab 2")  # Placeholder content for Tab 2

tabs = pn.Tabs(
    ("Date published", create_tab1_content(data)),
    ("Tab 2", tab2_content),
)

# For development purposes
# if __name__.startswith("bokeh"):
#     # Start with: panel serve main.py --show
#     app = tabs.servable()
#     app.show(port=5007)

app = tabs.servable()
