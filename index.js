require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// Models
// const User = require('./models/User');
// const Event = require('./models/Event');
// const Attendee = require('./models/Attendee');

// User Model
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// Event Model
const eventSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    attendeesTotal:{type:Number},
    date: { type: Date, required: true },
    type: { type: String, enum: ['Conference', 'Workshop', 'Meetup'], required: true }
});
const Event = mongoose.model('Event', eventSchema);

// Attendee Model
const attendeeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true }
});
const Attendee = mongoose.model('Attendee', attendeeSchema);

// Middleware for Authentication
const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ error: 'Access denied' });
    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ error: 'Invalid token' });
    }
};

// Authentication Routes
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (username !== 'admin' || password !== 'admin123') {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ username }, process.env.JWT_SECRET);
    res.json({ token });
});

// Event Management
app.post('/api/events', authMiddleware, async (req, res) => {
    try {
        const event = new Event(req.body);
        console.log(req.body)
        await event.save();
        res.json(event);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/events', authMiddleware, async (req, res) => {
    const { page = 1, limit = 2 } = req.query;
    const events = await Event.find().skip((page - 1) * limit).limit(parseInt(limit));
    const total = await Event.countDocuments();
    res.json({
        events,
        total
    });
});
app.get('/api/events/all', authMiddleware, async (req, res) => {
    try {
        const events = await Event.find(); // Fetch all events
        res.json(events);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching all events', error });
    }
});

app.get('/api/events/filter', authMiddleware, async (req, res) => {
    try {
        const { type } = req.query;
        const { page = 1, limit = 2 } = req.query;
        
        let query = {};
        if (type) {
            query.type = type;
        }

        const events = await Event.find(query)
            .skip((page - 1) * limit)
            .limit(parseInt(limit));
            
        const total = await Event.countDocuments(query);
        
        res.json({
            events,
            total
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/events/:id', authMiddleware, async (req, res) => {
    try {
        const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(event);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/events/:id', authMiddleware, async (req, res) => {
    try {
        await Event.findByIdAndDelete(req.params.id);
        res.json({ message: 'Event deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Attendee Management
app.post('/api/attendees', authMiddleware, async (req, res) => {
    try {
        // Check if attendee already exists for this event
        const existingAttendee = await Attendee.findOne({
            eventId: req.body.eventId,
            email: req.body.email // Assuming email is used to identify unique attendees
        });

        if (existingAttendee) {
            return res.status(400).json({ error: 'You are already registered for this event' });
        }

        const attendee = new Attendee(req.body);
        await attendee.save();
        
        // Update the event's attendees count
        await Event.findByIdAndUpdate(
            attendee.eventId,
            { $inc: { attendeesTotal: 1 } }
        );

        res.json(attendee);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/all-attendees', authMiddleware, async (req, res) => {
    try {
        const attendees = await Attendee.find();
        res.json(attendees);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.get('/api/attendees', authMiddleware, async (req, res) => {
    const { eventId } = req.query;
    const attendees = await Attendee.find({ eventId });
    res.json(attendees);
});

// Dashboard Insights
app.get('/api/dashboard', authMiddleware, async (req, res) => {
    const totalEvents = await Event.countDocuments();
    const totalAttendees = await Attendee.countDocuments();
    res.json({ totalEvents, totalAttendees });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
