require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const { randomUUID } = require('crypto');
const path = require('path');

const Employee = require('./models/Employee');
const Attendance = require('./models/Attendance');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Trust proxy so we can read the real IP behind reverse proxies
app.set('trust proxy', true);

const OFFICE_LAT = parseFloat(process.env.OFFICE_LAT);
const OFFICE_LNG = parseFloat(process.env.OFFICE_LNG);
const GEOFENCE_RADIUS = parseFloat(process.env.GEOFENCE_RADIUS) || 100;
const OFFICE_SUBNET = process.env.OFFICE_SUBNET || '192.168.100';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// --- Helpers ---

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.connection.remoteAddress;
}

function isOnOfficeNetwork(ip) {
  // Normalize IPv6-mapped IPv4 (::ffff:192.168.100.8 → 192.168.100.8)
  const normalized = ip.replace(/^::ffff:/, '');
  // Allow localhost (server-local requests) and office subnet
  if (normalized === '::1' || normalized === '127.0.0.1' || normalized === '1') return true;
  return normalized.startsWith(OFFICE_SUBNET + '.');
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isWithinGeofence(lat, lng) {
  if (OFFICE_LAT === 0 && OFFICE_LNG === 0) return true; // not configured yet
  return distanceMeters(OFFICE_LAT, OFFICE_LNG, lat, lng) <= GEOFENCE_RADIUS;
}

// --- API Routes ---

// Clock in/out
app.post('/api/clock/:token', async (req, res) => {
  try {
    const employee = await Employee.findOne({ qrToken: req.params.token });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const clientIp = getClientIp(req);
    const { lat, lng } = req.body;

    // Security check: WiFi first, geolocation as fallback
    const onNetwork = isOnOfficeNetwork(clientIp);
    const inGeofence = lat != null && lng != null && isWithinGeofence(lat, lng);
    let verification;

    if (onNetwork) {
      verification = 'wifi';
    } else if (inGeofence) {
      verification = 'geo-fallback';
    } else {
      return res.status(403).json({
        error: 'You must be on the office WiFi or at the shop location to clock in/out.'
      });
    }

    // Determine if clocking in or out based on last record
    const lastRecord = await Attendance.findOne({ employeeId: employee._id })
      .sort({ timestamp: -1 });

    const type = (!lastRecord || lastRecord.type === 'out') ? 'in' : 'out';

    const record = await Attendance.create({
      employeeId: employee._id,
      type,
      location: lat != null ? { lat, lng } : undefined,
      ip: clientIp,
      verification
    });

    res.json({
      success: true,
      employee: employee.name,
      type,
      timestamp: record.timestamp,
      verification
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get employee status (for the clock page)
app.get('/api/status/:token', async (req, res) => {
  try {
    const employee = await Employee.findOne({ qrToken: req.params.token });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const lastRecord = await Attendance.findOne({ employeeId: employee._id })
      .sort({ timestamp: -1 });

    const currentStatus = (!lastRecord || lastRecord.type === 'out') ? 'out' : 'in';

    res.json({
      name: employee.name,
      status: currentStatus,
      lastTimestamp: lastRecord ? lastRecord.timestamp : null
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Admin API ---

// List employees
app.get('/api/employees', async (req, res) => {
  const employees = await Employee.find().sort({ name: 1 });
  res.json(employees);
});

// Add employee
app.post('/api/employees', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const employee = await Employee.create({ name, qrToken: randomUUID() });
    res.json(employee);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete employee
app.delete('/api/employees/:id', async (req, res) => {
  try {
    await Employee.findByIdAndDelete(req.params.id);
    await Attendance.deleteMany({ employeeId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Generate QR code as data URL
app.get('/api/qr/:token', async (req, res) => {
  try {
    const url = `${BASE_URL}/clock/${req.params.token}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
    res.json({ qr: dataUrl, url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR' });
  }
});

// Attendance log
app.get('/api/attendance', async (req, res) => {
  try {
    const { date, startDate, endDate, employeeId, page = 1, limit = 50 } = req.query;
    const filter = {};
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)));

    if (employeeId) filter.employeeId = employeeId;

    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      filter.timestamp = { $gte: start, $lt: end };
    } else if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : new Date('1970-01-01');
      const end = endDate ? new Date(endDate) : new Date();
      end.setDate(end.getDate() + 1);
      filter.timestamp = { $gte: start, $lt: end };
    }

    const total = await Attendance.countDocuments(filter);
    const records = await Attendance.find(filter)
      .populate('employeeId', 'name')
      .sort({ timestamp: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize);

    const totalPages = Math.ceil(total / pageSize);

    res.json({
      records,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        totalPages
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// --- PDF Export ---

app.get('/api/export/pdf', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    const filter = {};

    // Date filtering
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      filter.timestamp = { $gte: start, $lt: end };
    } else if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : new Date('1970-01-01');
      const end = endDate ? new Date(endDate) : new Date();
      end.setDate(end.getDate() + 1);
      filter.timestamp = { $gte: start, $lt: end };
    }

    // Fetch all records for the date range
    const records = await Attendance.find(filter)
      .populate('employeeId', 'name')
      .sort({ timestamp: 1 })
      .lean();

    // Create PDF document
    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    // Set response headers for PDF download
    const filename = `Attendance_${date || startDate || 'All'}_${new Date().getTime()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Title
    doc.fontSize(20).font('Helvetica-Bold').text('Attendance Report', { align: 'center' });
    doc.moveDown(0.5);

    // Date range
    let dateRangeText = 'All Records';
    if (date) {
      dateRangeText = `Date: ${new Date(date).toLocaleDateString()}`;
    } else if (startDate || endDate) {
      const start = startDate ? new Date(startDate).toLocaleDateString() : 'Beginning';
      const end = endDate ? new Date(endDate).toLocaleDateString() : 'Today';
      dateRangeText = `Range: ${start} to ${end}`;
    }
    doc.fontSize(12).font('Helvetica').text(dateRangeText, { align: 'center' });
    doc.fontSize(11).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(1);

    // Table headers
    const tableTop = doc.y;
    const col1 = 40;      // Employee
    const col2 = 200;     // Type (In/Out)
    const col3 = 300;     // Timestamp
    const col4 = 450;     // Verification

    const headerHeight = 25;

    // Draw header background
    doc.rect(col1 - 10, tableTop, 520, headerHeight).fill('#e0e0e0');

    // Header text
    doc.fillColor('black').fontSize(10).font('Helvetica-Bold');
    doc.text('Employee', col1, tableTop + 5, { width: 150 });
    doc.text('Type', col2, tableTop + 5, { width: 80 });
    doc.text('Date & Time', col3, tableTop + 5, { width: 140 });
    doc.text('Verification', col4, tableTop + 5, { width: 90 });

    doc.moveDown(2);

    // Table rows
    const rowHeight = 20;
    const pageHeight = doc.page.height;
    let yPos = doc.y;

    records.forEach((record, idx) => {
      // Check if we need a new page
      if (yPos > pageHeight - 60) {
        doc.addPage();
        yPos = 40;
      }

      const employeeName = record.employeeId?.name || 'Unknown';
      const type = record.type.toUpperCase();
      const timestamp = new Date(record.timestamp).toLocaleString();
      const verification = record.verification || 'unknown';

      // Alternate row colors
      if (idx % 2 === 0) {
        doc.rect(col1 - 10, yPos - 3, 520, rowHeight).fill('#f9f9f9');
      }

      doc.fillColor('black').fontSize(9).font('Helvetica');
      doc.text(employeeName, col1, yPos, { width: 150 });
      doc.text(type, col2, yPos, { width: 80 });
      doc.text(timestamp, col3, yPos, { width: 140 });
      doc.text(verification, col4, yPos, { width: 90 });

      yPos += rowHeight;
    });

    // Footer
    doc.moveDown(1);
    doc.fontSize(9).text(`Total Records: ${records.length}`, { align: 'center' });

    // Finalize PDF
    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate PDF: ' + err.message });
  }
});

// --- Serve frontend pages ---

app.get('/clock/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'clock.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- Start ---

mongoose.connect(process.env.MONGODB_URI).then(() => {
  console.log('Connected to MongoDB');
  app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
  });
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});
