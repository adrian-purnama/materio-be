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
const unitRoutes = require('./routes/data entry/unit.route.js');
const itemRoutes = require('./routes/data entry/item.route.js');
const productRoutes = require('./routes/data entry/product.route.js');
const purchaseRoutes = require('./routes/data entry/purchase.route.js');
const soldRoutes = require('./routes/data entry/sold.route.js');
const dashboardRoutes = require('./routes/data entry/dashboard.route.js');
const unitModel = require('./model/unit.model');
const imageRoutes = require('./routes/image.route.js');
const externalRoutes = require('./routes/external.route.js');

const allowedOrigins = [
  'http://localhost:5173',   // Vite default
  'http://materio.amfphub.com',
  'https://materio.amfphub.com'
];

// CORS: allow /api/external from any origin (browser calls from other apps); restrict rest to allowedOrigins
app.use((req, res, next) => {
  if (req.path.startsWith('/api/external')) {
    return cors({ origin: true })(req, res, next);
  }
  return cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
  })(req, res, next);
});


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
.then(async () => {
    populateSystem()
    // Drop legacy unique index (owner + category) so multiple unit docs per owner are allowed
    try {
      await unitModel.collection.dropIndex('owner_1_category_1')
      console.log('Dropped legacy unit index owner_1_category_1')
    } catch {
      // Index may already be missing
    }
    console.log("MongoDB Connected")
})
.catch((err)=> (console.log(err)))


app.use('/auth', authRoutes)
app.use('/api/system', systemRoutes)
app.use('/api/users', userRoutes)
app.use('/api/units', unitRoutes)
app.use('/api/items', itemRoutes)
app.use('/api/products', productRoutes)
app.use('/api/purchases', purchaseRoutes)
app.use('/api/sold', soldRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/images', imageRoutes)
app.use('/api/external', externalRoutes)

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
