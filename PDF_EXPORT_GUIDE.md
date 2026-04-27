# PDF Export Feature - Usage Guide

## Overview
You can now export all attendance records to a professionally formatted PDF with date filtering capabilities.

## Features
✅ Export attendance data as tabulated PDF
✅ Specify date range (start and end dates)
✅ Export single date or date range
✅ Professional formatting with alternating row colors
✅ Automatic pagination for large datasets
✅ Includes employee names, clock in/out times, and verification method

## How to Use

### From Admin Dashboard
1. Navigate to the **"Attendance Range"** section at the bottom of the admin page
2. Select **Start Date** and **End Date** for the period you want to export
3. Click the **"📥 Export to PDF"** button
4. The PDF will automatically download to your default download folder

### Programmatically (API)
You can also trigger PDF exports directly via API endpoints:

#### Single Date Export
```
GET /api/export/pdf?date=2026-04-15
```

#### Date Range Export
```
GET /api/export/pdf?startDate=2026-04-01&endDate=2026-04-30
```

#### Export All Records
```
GET /api/export/pdf
```

## PDF Format
The generated PDF includes:
- Title: "Attendance Report"
- Date range information
- Generation timestamp
- Table with columns:
  - **Employee**: Employee name
  - **Type**: Clock in (IN) or Clock out (OUT)
  - **Date & Time**: Full timestamp
  - **Verification**: Method used (wifi, geo-fallback)
- Total record count
- Multi-page support with automatic page breaks

## Examples

### Export March 2026 Data
1. Start Date: `2026-03-01`
2. End Date: `2026-03-31`
3. Click "📥 Export to PDF"

### Export Last 7 Days
1. Start Date: (today - 7 days)
2. End Date: (today)
3. Click "📥 Export to PDF"

### Export Specific Date
1. Use the single date input in "Attendance Log" section, OR
2. Set both Start and End dates to the same date
3. Click "📥 Export to PDF"

## Technical Details
- Library: PDFKit (Node.js)
- Format: A4 size, portrait orientation
- Margins: 40px all around
- Font: Helvetica (standard PDF font)
- Max records per page: ~25-30 depending on content
- File naming: `Attendance_[date]_[timestamp].pdf`

## Notes
- Empty date filters will export ALL records in the database
- The PDF respects employee privacy (no IP addresses in the generated table)
- Large exports (thousands of records) may take a few seconds to generate
- Supported in all browsers and Vercel serverless environment
