const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  type: { type: String, enum: ['in', 'out'], required: true },
  timestamp: { type: Date, default: Date.now },
  location: {
    lat: Number,
    lng: Number
  },
  ip: String,
  verification: { type: String, enum: ['wifi', 'geo-fallback'], default: 'wifi' }
});

module.exports = mongoose.model('Attendance', attendanceSchema);
