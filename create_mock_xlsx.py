#!/usr/bin/env python3
from __future__ import annotations

import zipfile
from collections import defaultdict
from pathlib import Path
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parent
XLSX_FILE = ROOT / "mock-straw-export.xlsx"

HEADERS = [
    "Customer",
    "Farm",
    "Field Name",
    "Status",
    "Total Bales",
    "Hectares",
    "Crop",
    "Average Moisture %",
    "Photo Added",
    "Started",
    "Finished",
]

RECORDS = [
    ["Crown Point Farms", "Home Farm", "North 12", "Complete", 186, 14.2, "Wheat", 14.8, "Yes", "20/07/2026, 08:14:00", "20/07/2026, 11:42:00"],
    ["Crown Point Farms", "Home Farm", "Long Meadow", "Complete", 132, 9.7, "Barley", 15.6, "Yes", "20/07/2026, 12:10:00", "20/07/2026, 14:55:00"],
    ["Crown Point Farms", "Home Farm", "Church Piece", "Complete", 204, 16.1, "Wheat", 13.9, "Yes", "21/07/2026, 07:58:00", "21/07/2026, 12:24:00"],
    ["Crown Point Farms", "Home Farm", "Mill Ground", "Part complete", 118, 8.6, "Oats", 16.2, "Yes", "21/07/2026, 13:05:00", ""],
    ["Crown Point Farms", "Marsh Farm", "Marsh 4", "Complete", 226, 18.4, "Wheat", 14.4, "Yes", "22/07/2026, 08:22:00", "22/07/2026, 13:12:00"],
    ["Crown Point Farms", "Marsh Farm", "River Field", "Complete", 97, 7.3, "Spring Barley", 15.1, "Yes", "22/07/2026, 13:48:00", "22/07/2026, 16:04:00"],
    ["Crown Point Farms", "Marsh Farm", "Low Fen", "Complete", 164, 12.8, "Barley", 15.8, "Yes", "23/07/2026, 08:05:00", "23/07/2026, 11:36:00"],
    ["Crown Point Farms", "Marsh Farm", "Back Marsh", "Part complete", 88, 6.9, "Oats", 16.7, "Yes", "23/07/2026, 12:18:00", ""],
    ["Crown Point Farms", "Valley Farm", "Top Valley", "Complete", 211, 17.2, "Wheat", 14.1, "Yes", "24/07/2026, 07:49:00", "24/07/2026, 12:10:00"],
    ["Crown Point Farms", "Valley Farm", "Five Acres", "Complete", 62, 5.0, "Spring Barley", 15.9, "Yes", "24/07/2026, 12:52:00", "24/07/2026, 14:02:00"],
    ["Crown Point Farms", "Valley Farm", "Oak Field", "Complete", 149, 11.4, "Barley", 15.3, "Yes", "25/07/2026, 08:30:00", "25/07/2026, 11:22:00"],
    ["Crown Point Farms", "Valley Farm", "Station Piece", "Complete", 178, 13.6, "Wheat", 14.6, "Yes", "25/07/2026, 12:00:00", "25/07/2026, 15:38:00"],
    ["Norfolk Straw Co", "Hall Farm", "Hall 1", "Complete", 193, 15.1, "Wheat", 14.2, "Yes", "26/07/2026, 08:12:00", "26/07/2026, 12:08:00"],
    ["Norfolk Straw Co", "Hall Farm", "Hall 2", "Complete", 121, 9.2, "Oats", 16.4, "Yes", "26/07/2026, 12:45:00", "26/07/2026, 15:06:00"],
    ["Norfolk Straw Co", "Hall Farm", "Park Field", "Complete", 244, 19.5, "Wheat", 13.7, "Yes", "27/07/2026, 07:55:00", "27/07/2026, 13:00:00"],
    ["Norfolk Straw Co", "Hall Farm", "Pond Piece", "Complete", 76, 6.1, "Spring Barley", 15.5, "Yes", "27/07/2026, 13:36:00", "27/07/2026, 15:10:00"],
    ["Norfolk Straw Co", "Manor Farm", "Manor East", "Complete", 207, 16.8, "Barley", 15.0, "Yes", "28/07/2026, 08:04:00", "28/07/2026, 12:18:00"],
    ["Norfolk Straw Co", "Manor Farm", "Manor West", "Complete", 158, 12.0, "Wheat", 14.5, "Yes", "28/07/2026, 12:55:00", "28/07/2026, 16:00:00"],
    ["Norfolk Straw Co", "Manor Farm", "Little Close", "Part complete", 69, 5.4, "Oats", 16.9, "Yes", "29/07/2026, 08:20:00", ""],
    ["Norfolk Straw Co", "Manor Farm", "Big Close", "Complete", 231, 18.7, "Wheat", 13.8, "Yes", "29/07/2026, 10:22:00", "29/07/2026, 15:35:00"],
]


def column_name(index: int) -> str:
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def crop_style_id(value) -> int:
    return {"Wheat": 2, "Barley": 3, "Oats": 4, "Spring Barley": 5, "Hay": 6}.get(str(value), 0)


def cell_xml(value, row_number: int, column_number: int, style_id: int = 0) -> str:
    ref = f"{column_name(column_number)}{row_number}"
    style = f' s="{style_id}"' if style_id else ""
    if isinstance(value, (int, float)):
        return f'<c r="{ref}"{style}><v>{value}</v></c>'
    return f'<c r="{ref}"{style} t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'


def sheet_xml(rows: list[list], widths: list[int]) -> str:
    crop_column = HEADERS.index("Crop") + 1
    body = []
    for row_index, row in enumerate(rows, start=1):
        cells = "".join(
            cell_xml(value, row_index, column_index, crop_style_id(value) if row_index > 1 and column_index == crop_column else 0)
            for column_index, value in enumerate(row, start=1)
        )
        body.append(f'<row r="{row_index}">{cells}</row>')
    cols = "".join(f'<col min="{index}" max="{index}" width="{width}" customWidth="1"/>' for index, width in enumerate(widths, start=1))
    end_ref = f"{column_name(max(len(row) for row in rows))}{len(rows)}"
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:{end_ref}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>{cols}</cols>
  <sheetData>{''.join(body)}</sheetData>
</worksheet>'''


def bottom_totals(records: list[list]) -> list[list]:
    rows = [
        blank_row(),
        label_row("Totals"),
        total_row("Grand Total", records),
        blank_row(),
        label_row("Customer Totals"),
        customer_total_header(),
    ]
    groups: dict[str, list[list]] = defaultdict(list)
    for record in records:
        groups[record[0]].append(record)
    for customer in sorted(groups):
        rows.append(total_row(customer, groups[customer]))
    return rows


def blank_row() -> list:
    return [""] * len(HEADERS)


def label_row(label: str) -> list:
    row = blank_row()
    row[0] = label
    return row


def customer_total_header() -> list:
    row = blank_row()
    row[0] = "Customer"
    row[4] = "Total Bales"
    row[5] = "Hectares"
    row[7] = "Avg Moisture %"
    return row


def total_row(label: str, records: list[list]) -> list:
    row = blank_row()
    row[0] = label
    row[4] = sum(record[4] for record in records)
    row[5] = round(sum(record[5] for record in records), 2)
    row[7] = round(sum(record[7] for record in records) / len(records), 1)
    return row


def write_xlsx(rows: list[list]) -> None:
    files = {
        "[Content_Types].xml": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>''',
        "_rels/.rels": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>''',
        "xl/workbook.xml": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Straw Bales" sheetId="1" r:id="rId1"/></sheets>
</workbook>''',
        "xl/_rels/workbook.xml.rels": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>''',
        "xl/styles.xml": STYLES_XML,
        "xl/worksheets/sheet1.xml": sheet_xml(rows, [22, 18, 20, 15, 13, 12, 16, 18, 12, 20, 20]),
    }
    with zipfile.ZipFile(XLSX_FILE, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)


STYLES_XML = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF4F8F46"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDFBD56"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD78632"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF4D8F9E"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF8FA84F"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="0" fillId="1" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="6" borderId="0" xfId="0" applyFill="1"/>
  </cellXfs>
</styleSheet>'''


def main() -> None:
    write_xlsx([HEADERS, *RECORDS, *bottom_totals(RECORDS)])


if __name__ == "__main__":
    main()
