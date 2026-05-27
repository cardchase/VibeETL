import base64
import io
import polars as pl
from typing import Dict
import json
import polars as pl
from typing import Dict
import plotly.express as px
import plotly.graph_objects as go
from app.tools.base import BaseNode, SchemaCompatibilityError

class VisualizationNode(BaseNode):
    MANIFEST = {
        "id": "visualization",
        "name": "Visualization",
        "category": "analysis",
        "icon": "BarChart3",
        "description": "Generate interactive web-native visual charts using Plotly.",
        "ui_schema": [
            {"field": "chartType", "type": "select", "label": "Chart Type", "options": ["scatter", "line", "bar", "box", "sankey"], "default": "scatter"},
            {"field": "xAxis", "type": "column_select", "label": "X-Axis Column", "default": ""},
            {"field": "yAxis", "type": "column_select", "label": "Y-Axis Column", "default": ""},
            {"field": "colorBy", "type": "column_select", "label": "Color By (Group)", "default": ""},
            {"field": "barmode", "type": "select", "label": "Bar Mode", "options": ["group", "stack", "relative"], "default": "group"},
            {"field": "title", "type": "string", "label": "Chart Title", "default": ""}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        if "input" not in inputs:
            raise ValueError("Visualization node requires an input dataframe named 'input'.")
            
        df = inputs["input"]
        chart_type = self.parameters.get("chartType", "scatter")
        x_axis = self.parameters.get("xAxis", "")
        y_axis = self.parameters.get("yAxis", "")
        color_by = self.parameters.get("colorBy", "")
        barmode = self.parameters.get("barmode", "group")
        title = self.parameters.get("title", "")
        
        if not x_axis or not y_axis:
            if chart_type != 'sankey':
                self.log("Missing X or Y axis configuration. Returning empty payload.")
                return pl.DataFrame({"__vibe_html_payload__": [""]})
            
        self.log(f"Converting data for {chart_type} chart plotting...")
        
        # We need pandas for plotly native integration
        pdf = df.to_pandas()
        
        # A beautiful, strong, modern color palette
        color_palette = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#ec4899", "#14b8a6"]
        
        # Validate color_by
        color = color_by if color_by and color_by in pdf.columns else None
        
        try:
            if chart_type == "scatter":
                fig = px.scatter(pdf, x=x_axis, y=y_axis, color=color, title=title, color_discrete_sequence=color_palette)
            elif chart_type == "line":
                fig = px.line(pdf, x=x_axis, y=y_axis, color=color, title=title, color_discrete_sequence=color_palette)
            elif chart_type == "bar":
                fig = px.bar(pdf, x=x_axis, y=y_axis, color=color, title=title, color_discrete_sequence=color_palette)
            elif chart_type == "pie":
                fig = px.pie(pdf, names=x_axis, values=y_axis, color=color, title=title, color_discrete_sequence=color_palette)
            elif chart_type == "histogram":
                fig = px.histogram(pdf, x=x_axis, color=color, title=title, color_discrete_sequence=color_palette)
            elif chart_type == "box":
                fig = px.box(pdf, x=x_axis, y=y_axis, color=color, title=title, color_discrete_sequence=color_palette)
            elif chart_type == "violin":
                fig = px.violin(pdf, x=x_axis, y=y_axis, color=color, title=title, color_discrete_sequence=color_palette)
            elif chart_type == "heatmap":
                fig = px.density_heatmap(pdf, x=x_axis, y=y_axis, z=color, title=title, color_continuous_scale="Viridis")
            elif chart_type == "waterfall":
                fig = go.Figure(go.Waterfall(
                    name="20", orientation="v",
                    measure=["relative"] * len(pdf),
                    x=pdf[x_axis],
                    textposition="outside",
                    text=pdf[y_axis],
                    y=pdf[y_axis],
                ))
                if title: fig.update_layout(title=title)
            elif chart_type == "funnel":
                fig = px.funnel(pdf, x=y_axis, y=x_axis, title=title)
            elif chart_type == "scatter_3d":
                fig = px.scatter_3d(pdf, x=x_axis, y=y_axis, z=pdf.columns[2] if len(pdf.columns)>2 else x_axis, title=title)
            elif chart_type == "sankey":
                # For sankey, we assume x_axis is source and y_axis is target.
                # If there's a third column selected (not yet supported in UI but fallback to 1) we use for value.
                # Here we aggregate counts.
                counts = pdf.groupby([x_axis, y_axis]).size().reset_index(name='value')
                
                # Create unique labels
                labels = list(set(counts[x_axis].unique()).union(set(counts[y_axis].unique())))
                label_map = {label: i for i, label in enumerate(labels)}
                
                counts['source_id'] = counts[x_axis].map(label_map)
                counts['target_id'] = counts[y_axis].map(label_map)
                
                fig = go.Figure(data=[go.Sankey(
                    node=dict(
                        pad=15,
                        thickness=20,
                        line=dict(color="black", width=0.5),
                        label=labels
                    ),
                    link=dict(
                        source=counts['source_id'],
                        target=counts['target_id'],
                        value=counts['value']
                    )
                )])
                if title:
                    fig.update_layout(title_text=title, font_size=10)
            
            # Configure layout using customized inputs
            layout_args = dict(
                template="plotly_white", 
                margin=dict(l=60, r=60, t=80 if title else 40, b=60),
                font=dict(family="Inter, sans-serif", size=14, color="#333"),
                plot_bgcolor="rgba(0,0,0,0)",
                paper_bgcolor="rgba(0,0,0,0)",
                hoverlabel=dict(
                    bgcolor="white", 
                    font_size=13, 
                    font_family="Inter, sans-serif",
                    bordercolor="#e2e8f0"
                )
            )
            
            # Apply bar modes if applicable
            if chart_type in ["bar", "histogram"]:
                layout_args["barmode"] = barmode

            fig.update_layout(**layout_args)
            
            # Make axes more beautiful and Tableau-like
            fig.update_xaxes(
                showgrid=True, gridwidth=1, gridcolor='#f3f4f6', 
                zeroline=True, zerolinecolor='#e5e7eb', zerolinewidth=1,
                title_font=dict(size=13, color='#475569'), tickfont=dict(size=11, color='#64748b')
            )
            fig.update_yaxes(
                showgrid=True, gridwidth=1, gridcolor='#f3f4f6', 
                zeroline=True, zerolinecolor='#e5e7eb', zerolinewidth=1,
                rangemode='tozero', # Fix negative padding on positive data
                title_font=dict(size=13, color='#475569'), tickfont=dict(size=11, color='#64748b')
            )
            
            # Apply semantic formatting from upstream metadata
            metadata = getattr(self, "upstream_semantic_metadata", {})
            
            if x_axis in metadata:
                sem_type = metadata[x_axis]
                if sem_type == "currency_usd":
                    fig.update_xaxes(tickformat="$,.2f")
                elif sem_type == "percentage":
                    fig.update_xaxes(tickformat=".0%")
                    
            if y_axis in metadata:
                sem_type = metadata[y_axis]
                if sem_type == "currency_usd":
                    fig.update_yaxes(tickformat="$,.2f")
                elif sem_type == "percentage":
                    fig.update_yaxes(tickformat=".0%")
            
            # Apply styling to traces for smoother, modern look
            try:
                if chart_type == "bar" or chart_type == "histogram":
                    fig.update_traces(marker_cornerradius=8, selector=dict(type='bar'))
            except Exception:
                pass # Ignore if older plotly version doesn't support cornerradius
                
            try:
                fig.update_traces(marker=dict(line=dict(width=0))) # Remove border blockiness
            except Exception:
                pass
            
            # Add download plot configuration for exporting
            config = {
                'responsive': True, # Automatically resize when container resizes
                'displayModeBar': True,
                'displaylogo': False,
                'modeBarButtonsToRemove': ['lasso2d', 'select2d'],
                'toImageButtonOptions': {
                    'format': 'png',
                    'filename': 'vibeetl_chart_export',
                    'height': 600,
                    'width': 800,
                    'scale': 2 # High res export (2x multiplier)
                }
            }
            
            # Generate the raw HTML representation
            html_payload = fig.to_html(full_html=False, include_plotlyjs='cdn', config=config)
            
            self.log(f"Successfully generated {chart_type} chart and encoded to HTML payload.")
            # Pass the HTML string down the wire in a reserved column
            return pl.DataFrame({"__vibe_html_payload__": [html_payload]})
            
        except Exception as e:
            raise ValueError(f"Failed to generate {chart_type} chart: {e}")
