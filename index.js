const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const systemModel = require('./model/system.model');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

const authRoutes = require('./routes/auth.route.js');
const systemRoutes = require('./routes/data entry/system.route.js');
const userRoutes = require('./routes/data entry/user.route.js');
const imageRoutes = require('./routes/image.route.js');

const allowedOrigins = [
    'http://localhost:5173',   // Vite default
    'https://event-tracker.amfphub.com'
  ];
  
  app.use(cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  }))


app.use(express.json());

const populateSystem = async () => {
    const findSystem = await systemModel.findOne({})
    if(findSystem){
        return;
    }
    const initalSystem = {
        appName : 'Stream Haven',
        openRegistration : true,
        logoUrl : 'https://placehold.co/600x400',
    }
    systemModel.create(initalSystem)
    console.log("init system success")
}



app.get('/api/health', (req, res) => {
    res.status(200).json({message : "Made By Love from Adrian"})
})


mongoose.connect(process.env.MONGODB_URI, {
    dbName : "materio",
})
.then(()=>{
    populateSystem()
    console.log("MognoDB Connected")
})
.catch((err)=> (console.log(err)))


app.use('/auth', authRoutes)
app.use('/api/system', systemRoutes)
app.use('/api/users', userRoutes)
app.use('/api/images', imageRoutes)

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
