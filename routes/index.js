const express = require('express')
const router = express.Router()
const Vinyl = require('../models/vinyl')
const vinyls = []
const curationPrompt=process.env.CURATION_PROMPT

router.get('/', (req, res)=>{
    res.render('index', {vinyls, curationPrompt})
})

module.exports = router