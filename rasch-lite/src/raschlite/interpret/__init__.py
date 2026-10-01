"""Mesin interpretasi berbasis aturan (tanpa Qt, tanpa jaringan)."""

from .glossary import GLOSSARY, tooltip
from .narrative import Interpretation, interpret, summary_markdown, to_markdown

__all__ = ["GLOSSARY", "tooltip", "Interpretation", "interpret", "summary_markdown", "to_markdown"]
