from app.tools.base import BaseNode
from app.tools.file_input import FileInputNode
from app.tools.filter import FilterNode
from app.tools.sort import SortNode
from app.tools.select import SelectNode
from app.tools.browse import BrowseNode
from app.tools.image_caption import ImageCaptionNode
from app.tools.file_output import FileOutputNode
from app.tools.regex import RegexNode

NODE_CLASSES = {
    "fileInput": FileInputNode,
    "fileOutput": FileOutputNode,
    "filter": FilterNode,
    "sort": SortNode,
    "select": SelectNode,
    "regex": RegexNode,
    "browse": BrowseNode,
    "imageCaption": ImageCaptionNode
}
