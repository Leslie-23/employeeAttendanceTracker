const express = require('express');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const { randomUUID } = require('crypto');

const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }));
app.set('trust proxy', true);

// --- DB Connection (reuse across serverless invocations) ---
let connectionPromise = null;
async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  if (connectionPromise) return connectionPromise;

  connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 8000,
    bufferCommands: false
  });

  try {
    await connectionPromise;
  } catch (err) {
    connectionPromise = null;
    throw err;
  }
}

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
  const normalized = ip.replace(/^::ffff:/, '');
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
  if (OFFICE_LAT === 0 && OFFICE_LNG === 0) return true;
  return distanceMeters(OFFICE_LAT, OFFICE_LNG, lat, lng) <= GEOFENCE_RADIUS;
}

// Health check (no DB required) - hit /api/health to verify the function runs
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    hasMongoUri: !!process.env.MONGODB_URI,
    hasLat: !!process.env.OFFICE_LAT,
    dbState: mongoose.connection.readyState
  });
});

// --- Middleware: connect to DB before each request ---
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('DB connection error:', err.message, err);
    res.status(500).json({ error: 'Database connection failed: ' + err.message });
  }
});

// --- API Routes ---

app.post('/api/clock/:token', async (req, res) => {
  try {
    const employee = await Employee.findOne({ qrToken: req.params.token });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const clientIp = getClientIp(req);
    const { lat, lng } = req.body;

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

app.get('/api/employees', async (req, res) => {
  const employees = await Employee.find().sort({ name: 1 });
  res.json(employees);
});

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

app.delete('/api/employees/:id', async (req, res) => {
  try {
    await Employee.findByIdAndDelete(req.params.id);
    await Attendance.deleteMany({ employeeId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/qr/:token', async (req, res) => {
  try {
    const url = `${BASE_URL}/clock/${req.params.token}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
    res.json({ qr: dataUrl, url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR' });
  }
});

app.get('/api/attendance', async (req, res) => {
  try {
    const { date, employeeId } = req.query;
    const filter = {};

    if (employeeId) filter.employeeId = employeeId;

    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      filter.timestamp = { $gte: start, $lt: end };
    }

    const records = await Attendance.find(filter)
      .populate('employeeId', 'name')
      .sort({ timestamp: -1 })
      .limit(200);

    res.json(records);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Analytics ---
app.get('/api/analytics', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 14, 90);
    const since = new Date();
    since.setDate(since.getDate() - days + 1);
    since.setHours(0, 0, 0, 0);

    const records = await Attendance.find({ timestamp: { $gte: since } })
      .populate('employeeId', 'name')
      .sort({ timestamp: 1 })
      .lean();

    // Daily clock-in counts
    const dailyMap = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      dailyMap[key] = { date: key, in: 0, out: 0 };
    }
    records.forEach(r => {
      const key = new Date(r.timestamp).toISOString().slice(0, 10);
      if (dailyMap[key]) dailyMap[key][r.type]++;
    });
    const daily = Object.values(dailyMap);

    // Hours per employee (current week - last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekRecords = records.filter(r => new Date(r.timestamp) >= weekAgo);

    // Group by employee, pair consecutive in/out
    const byEmployee = {};
    weekRecords.forEach(r => {
      if (!r.employeeId) return;
      const id = r.employeeId._id.toString();
      if (!byEmployee[id]) byEmployee[id] = { name: r.employeeId.name, records: [], hours: 0 };
      byEmployee[id].records.push(r);
    });

    Object.values(byEmployee).forEach(emp => {
      let openIn = null;
      emp.records.forEach(r => {
        if (r.type === 'in') openIn = new Date(r.timestamp);
        else if (r.type === 'out' && openIn) {
          const ms = new Date(r.timestamp) - openIn;
          emp.hours += ms / (1000 * 60 * 60);
          openIn = null;
        }
      });
      emp.hours = Math.round(emp.hours * 10) / 10;
      delete emp.records;
    });

    const employeeHours = Object.values(byEmployee)
      .sort((a, b) => b.hours - a.hours);

    res.json({ daily, employeeHours, totalRecords: records.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- CSV Import (temporary - for backfilling historical data) ---
// Accepts either CSV text body or JSON { csv: "..." }
// CSV format: name,type,timestamp    (header optional)
// e.g.:
//   Ahmed Adams,in,2026-04-07 08:00
//   Ahmed Adams,out,2026-04-07 17:30
app.post('/api/import', async (req, res) => {
  try {
    let csvText = '';
    if (typeof req.body === 'string') csvText = req.body;
    else if (req.body && typeof req.body.csv === 'string') csvText = req.body.csv;
    else return res.status(400).json({ error: 'Provide CSV as text body or { csv: "..." }' });

    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return res.status(400).json({ error: 'Empty CSV' });

    // Skip header if first line looks like one
    const first = lines[0].toLowerCase();
    const startIdx = (first.includes('name') && first.includes('type')) ? 1 : 0;

    const employeeCache = {};
    async function getOrCreateEmployee(name) {
      const key = name.toLowerCase();
      if (employeeCache[key]) return employeeCache[key];
      let emp = await Employee.findOne({ name: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') });
      if (!emp) emp = await Employee.create({ name, qrToken: require('crypto').randomUUID() });
      employeeCache[key] = emp;
      return emp;
    }

    const results = { inserted: 0, skipped: 0, errors: [], createdEmployees: [] };
    const toInsert = [];

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 3) {
        results.skipped++;
        results.errors.push(`Line ${i + 1}: need 3 columns, got ${parts.length}`);
        continue;
      }

      const [name, rawType, ...tsParts] = parts;
      const type = rawType.toLowerCase();
      const tsStr = tsParts.join(',').replace(/^["']|["']$/g, '');
      const timestamp = new Date(tsStr);

      if (!['in', 'out'].includes(type)) {
        results.skipped++;
        results.errors.push(`Line ${i + 1}: type must be 'in' or 'out', got '${rawType}'`);
        continue;
      }
      if (isNaN(timestamp.getTime())) {
        results.skipped++;
        results.errors.push(`Line ${i + 1}: invalid timestamp '${tsStr}'`);
        continue;
      }

      try {
        const wasNew = !employeeCache[name.toLowerCase()] && !(await Employee.findOne({ name: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }));
        const emp = await getOrCreateEmployee(name);
        if (wasNew && !results.createdEmployees.includes(emp.name)) {
          results.createdEmployees.push(emp.name);
        }
        toInsert.push({
          employeeId: emp._id,
          type,
          timestamp,
          verification: 'wifi',
          ip: 'imported'
        });
      } catch (err) {
        results.errors.push(`Line ${i + 1}: ${err.message}`);
      }
    }

    if (toInsert.length) {
      await Attendance.insertMany(toInsert);
      results.inserted = toInsert.length;
    }

    res.json(results);
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

module.exports = app;
