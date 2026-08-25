from app.tools.base import BaseNode
from app.tools.file_input import FileInputNode
from app.tools.text_input import TextInputNode
from app.tools.filter import FilterNode
from app.tools.sort import SortNode
from app.tools.select import SelectNode
from app.tools.browse import BrowseNode
from app.tools.image_caption import ImageCaptionNode
from app.tools.file_output import FileOutputNode
from app.tools.regex import RegexNode
from app.tools.pivot import PivotNode
from app.tools.unpivot import UnpivotNode
from app.tools.union import UnionNode
from app.tools.data_cleansing import CleansingNode
from app.tools.formula import FormulaNode
from app.tools.join import JoinNode
from app.tools.summarize import SummarizeNode
from app.tools.unique import UniqueNode
from app.tools.visualization import VisualizationNode
from app.tools.report_builder import ReportBuilderNode
from app.tools.database_input import DatabaseInputExecutor
from app.tools.database_output import DatabaseOutputExecutor
from app.tools.record_id import RecordIDNode
from app.tools.field_info import FieldInfoNode
from app.tools.folder_input import FolderInputNode
from app.tools.dynamic_input import DynamicInputNode

from app.tools.gemini_ai import GeminiAINode
from app.tools.datetime_parser import DateTimeNode
from app.tools.python_code import PythonCodeNode
from app.tools.sampling import SamplingNode
from app.tools.llm_chunker import LLMChunkerNode
from app.tools.gcs_input import GCSInputNode
from app.tools.gcs_output import GCSOutputNode
from app.tools.google_sheets_input import GoogleSheetsInputNode
from app.tools.google_sheets_output import GoogleSheetsOutputNode
from app.tools.transpose import TransposeNode

# Newly added tools
from app.tools.soccer_reader import SoccerReaderNode
from app.tools.data_profiler import DataProfilerNode
from app.tools.odds_portal_historical import OddsPortalScraperNode
from app.tools.odds_portal_historical_v2 import OddsPortalScraperNodeV2
from app.tools.odds_portal_upcoming import OddsPortalUpcomingNode
from app.tools.predictor import PredictorNode
from app.tools.odds_analyzer import OddsAnalyzerNode
from app.tools.football_engine import FootballEngineNode

NODE_CLASSES = {
    "fileInput": FileInputNode,
    "textInput": TextInputNode,
    "databaseInput": DatabaseInputExecutor,
    "databaseOutput": DatabaseOutputExecutor,
    "fileOutput": FileOutputNode,
    "reportBuilder": ReportBuilderNode,
    "folderInput": FolderInputNode,
    "dynamicInput": DynamicInputNode,
    "filter": FilterNode,
    "sort": SortNode,
    "select": SelectNode,
    "regex": RegexNode,
    "browse": BrowseNode,
    "imageCaption": ImageCaptionNode,
    "pivot": PivotNode,
    "unpivot": UnpivotNode,
    "transpose": TransposeNode,
    "union": UnionNode,
    "data_cleansing": CleansingNode,
    "formula": FormulaNode,
    "join": JoinNode,
    "summarize": SummarizeNode,
    "unique": UniqueNode,
    "visualization": VisualizationNode,
    "record_id": RecordIDNode,
    "gemini_ai": GeminiAINode,
    "datetime": DateTimeNode,
    "python_code": PythonCodeNode,
    "sampling": SamplingNode,
    "llm_chunker": LLMChunkerNode,
    "gcs_in": GCSInputNode,
    "gcs_out": GCSOutputNode,
    "google_sheets_in": GoogleSheetsInputNode,
    "google_sheets_out": GoogleSheetsOutputNode,
    "fieldInfo": FieldInfoNode,
    
    # New additions
    "soccer_reader": SoccerReaderNode,
    "data_profiler": DataProfilerNode,
    "odds_portal_scraper": OddsPortalScraperNode,
    "odds_portal_scraper_v2": OddsPortalScraperNodeV2,
    "odds_portal_upcoming": OddsPortalUpcomingNode,
    "predictor": PredictorNode,
    "odds_analyzer": OddsAnalyzerNode,
    "football_engine": FootballEngineNode
}
