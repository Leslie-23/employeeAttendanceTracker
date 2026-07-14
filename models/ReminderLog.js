const mongoose = require('mongoose');

const reminderLogSchema = new mongoose.Schema({
  date: { type: String, required: true },
  stage: { type: String, enum: ['opening-745', 'opening-750', 'weekly-owner'], required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  employeeName: String,
  recipient: { type: String, required: true },
  kind: { type: String, enum: ['employee', 'manager', 'owner'], required: true },
  status: { type: String, enum: ['sent', 'skipped', 'failed'], required: true },
  reason: String,
  providerMessageId: String,
  error: String,
  createdAt: { type: Date, default: Date.now }
});

reminderLogSchema.index(
  { date: 1, stage: 1, recipient: 1, employeeId: 1, kind: 1 },
  { unique: true }
);

module.exports = mongoose.model('ReminderLog', reminderLogSchema);
