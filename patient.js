const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema({
  rfid: { type: String, unique: true, required: true },
  name: { type: String },
  age: { type: Number },
  gender: { type: String },
  contact: { type: String },
  medicalHistory: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Patient', PatientSchema);
