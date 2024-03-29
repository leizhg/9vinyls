if (process.env.NODE_ENV != 'production'){
    require('dotenv').config()
}
const express = require('express')
const app = express()
const expressLayouts = require('express-ejs-layouts')

const indexRouter = require('./routes/index')
const vinylsRouter = require('./routes/vinyls'); // Adjust the path accordingly
app.use(express.json()); // To parse JSON bodies
app.use(vinylsRouter);

app.set('view engine', 'ejs')
app.set('views', __dirname+ '/views')
app.set('layout', 'layouts/layout')
app.use(expressLayouts)
app.use(express.static('public'))
//app.use(express.static(__dirname + '/public'));

const mongoose = require('mongoose')

console.log('Starting server.js')
console.log('DATABASE_URL :'+process.env.DATABASE_URL)

mongoose.connect(process.env.DATABASE_URL)

const db=mongoose.connection
db.on('error', error=> console.error(error))
db.once('open', ()=>console.log('Connected to Mongoose DB'))


app.use('/', indexRouter)

app.listen(process.env.PORT || 3000)