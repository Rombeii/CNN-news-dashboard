# CNN News Dashboard

CNN News Dashboard is a Python project that provides a dashboard interface for exploring the CNN-DailyMail News Text Summarization dataset. This dashboard allows users to visualize and analyze various aspects of the news articles in an interactive manner.

The Dashboard is deployed to [Github Pages](https://rombeii.github.io/CNN-news-dashboard/app/main.html).

## Dataset

The CNN-DailyMail news text summarization dataset used in this project is sourced from [this Kaggle dataset](https://www.kaggle.com/datasets/gowrishankarp/newspaper-text-summarization-cnn-dailymail). It contains a collection of news articles from CNN and DailyMail, along with corresponding article summaries. The dataset provides an excellent resource for text summarization research and analysis.

Please note that some preprocessing has been applied to the dataset as part of the accompanying [CNN-text](https://github.com/rombeii/CNN-text) project.

## Running the Dashboard

To run the CNN News Dashboard, follow these steps:

1. Clone the repository
2. Set up a Python 3.10 virtual environment:
```shell
   python3 -m venv env
   env\Scripts\activate # for Windows
```
3. Install the required dependencies:
```shell
   pip install -r requirements.txt
```
4. Uncomment the following lines in `main.py`:
```python
if __name__.startswith("bokeh"):
   app = tabs.servable()
   app.show(port=5007)
```
5. Comment out the line below those uncommented lines:   
```python
   # app = tabs.servable()
```
6.  Open a terminal or command prompt in the project directory.
    
7.  Run the following command to start the dashboard:
 ```shell
   panel serve main.py --show
```