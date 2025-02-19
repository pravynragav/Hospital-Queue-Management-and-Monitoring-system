// index.js
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');

const Patient = require('./models/Patient');   // Patient model
const RFIDData = require('./models/RFIDData');     // RFID data model
const counters = require('./data/counters');       // In-memory counters for token generation

const app = express();
const port = 1337;

// Manually set your server's IP address
const serverIP = '192.168.42.12';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // Serve front-end from the "public" folder

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/smartHospital', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB database'))
  .catch(err => console.error('Error connecting to MongoDB:', err));

// Root endpoint returns server message and IP
app.get('/', (req, res) => {
  res.json({ message: 'Smart Hospital Backend Server is Running!', ip: serverIP });
});

// Create HTTP server and attach Socket.io
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, { cors: { origin: '*' } });

// Socket.io connection event
io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);
});

// Endpoint to receive RFID scan, store data, and emit via WebSocket
app.post('/api/rfid', async (req, res) => {
  const { rfid } = req.body;
  try {
    const rfidRecord = new RFIDData({ rfid });
    const savedData = await rfidRecord.save();
    console.log('RFID data saved:', savedData);
    io.emit('rfidScanned', { rfid: savedData.rfid, timestamp: savedData.timestamp });
    res.status(200).json({ message: 'RFID data saved and emitted', data: savedData });
  } catch (error) {
    console.error('Error saving RFID data:', error);
    res.status(500).json({ message: 'Error saving RFID data' });
  }
});

// Endpoint for patient registration and token generation
app.post('/api/register', async (req, res) => {
  const { rfid, name, age, gender, contact, medicalHistory, serviceType } = req.body;
  try {
    // Check if patient exists
    let patient = await Patient.findOne({ rfid });
    let newPatient = false;
    if (!patient) {
      patient = new Patient({ rfid, name, age, gender, contact, medicalHistory });
      await patient.save();
      newPatient = true;
    }
    // Save raw RFID data
    const rfidRecord = new RFIDData({ rfid });
    await rfidRecord.save();

    // Determine patient category based on gender and age
    let patientCategory = 'general';
    if (gender && gender.toLowerCase() === 'female') {
      patientCategory = 'female';
    }
    if (age && age >= 60) {
      patientCategory = 'senior';
    }
    
    // Token generation: select eligible counters by serviceType
    let eligibleCounters = counters.filter(counter => counter.service === serviceType);
    if (eligibleCounters.length === 0) {
      return res.status(400).json({ message: 'No eligible counters for the requested service.' });
    }
    // Choose the counter with the least pending tokens
    let selectedCounter = eligibleCounters.reduce((prev, curr) => {
      return (prev.pending <= curr.pending) ? prev : curr;
    });
    
    // Generate a new token
    selectedCounter.lastToken++;
    selectedCounter.pending++;
    const waitingCount = selectedCounter.pending - 1;
    
    res.status(200).json({
      message: 'Registration and token generation successful!',
      newPatient,
      patient,
      counter: selectedCounter.id,
      token: selectedCounter.lastToken,
      waitingCount,
      patientCategory
    });
    
  } catch (err) {
    console.error('Error processing registration:', err);
    res.status(500).json({ message: 'Error processing registration' });
  }
});

// Start the server with Socket.io attached
server.listen(port, () => {
  console.log(`Server listening on http://${serverIP}:${port}`);
});
