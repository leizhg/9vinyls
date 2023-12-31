const mongoose = require('mongoose');

const vinylSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  artist: {
    type: String,
    required: false
  },
  genre: {
    type: String,
    required: false
  },
  coverImage: {
    type: String,
    required: false
  },
  recommendationReason: {
    type: String,
    required: false
  },
  // Add additional fields here if needed, such as release date, label, etc.
});

const Vinyl = mongoose.model('Vinyl', vinylSchema);

module.exports = Vinyl;
