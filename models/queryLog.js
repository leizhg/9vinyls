const mongoose = require('mongoose');

const queryLogSchema = new mongoose.Schema({
    time: { type: Date, default: Date.now },
    curator: String,
    prompt: String,
    titleEntered: String,
    results: String // Store JSON results
});

const QueryLog = mongoose.model('QueryLog', queryLogSchema);

module.exports = QueryLog;

