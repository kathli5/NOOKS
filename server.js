// start app with 'npm run dev' in a terminal window
// go to http://localhost:port/ to view your deployment!
// every time you change something in server.js and save, your deployment will automatically reload

// to exit, type 'ctrl + c', then press the enter key in a terminal window
// if you're prompted with 'terminate batch job (y/n)?', type 'y', then press the enter key in the same terminal

// standard modules, loaded from node_modules
const path = require('path');
require("dotenv").config({ path: path.join(process.env.HOME, '.cs304env') });
const express = require('express');
const morgan = require('morgan');
const serveStatic = require('serve-static');
const bodyParser = require('body-parser');
const cookieSession = require('cookie-session');
const flash = require('express-flash');
const multer = require('multer');
const bcrypt = require('bcrypt');
require('dotenv').config();
require('dotenv').config();
const apiKey = process.env.API_KEY;

// our modules loaded from cwd

const { Connection } = require('./connection');
const cs304 = require('./cs304');

// Create and configure the app

const app = express();

// Morgan reports the final status code of a request's response
app.use(morgan('tiny'));

app.use(cs304.logStartRequest);

// This handles POST data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(cs304.logRequestData);  // tell the user about any request data
app.use(flash());

// enabling css
app.use('/public', express.static("public"));

app.use(serveStatic('public'));
app.set('view engine', 'ejs');

app.use('/uploads', express.static('uploads'));

const mongoUri = cs304.getMongoUri();

app.use(cookieSession({
    name: 'session',
    keys: ['horsebattery'],
    // Cookie Options
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
}));

const ROUNDS = 10;

var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads')
    },
    filename: function (req, file, cb) {
        let parts = file.originalname.split('.');
        let ext = parts[parts.length - 1];
        let hhmmss = new Date();
        hhmmss = hhmmss.toTimeString();
        cb(null, file.fieldname + '-' + hhmmss + '.' + ext);
    }
})

var upload = multer({
    storage: storage,
    // max fileSize in bytes, causes an ugly error
    limits: { fileSize: 100_000 }
});

// ================================================================
// custom routes here

const DB = process.env.USER;
const DBNAME = "nooks_db";
const NOOKS = "nooks";
const USERS = "users";

// main page. This shows the use of session cookies
app.get('/', (req, res) => {
    let uid = req.session.uid || 'unknown';
    return res.render('index.ejs', { uid });
});

//Adding a new user. Adds username and password to user collection
app.post("/join", async (req, res) => {
    try {
        const username = req.body.username;
        const password = req.body.password;
        const db = await Connection.open(mongoUri, DBNAME);
        var existingUser = await db.collection(USERS).findOne({ username: username });
        if (existingUser) {
            req.flash('error', "Login already exists - please try logging in instead.");
            return res.redirect('/')
        }
        const hash = await bcrypt.hash(password, ROUNDS);
        await db.collection(USERS).insertOne({
            username: username,
            hash: hash
        });
        console.log('successfully joined', username, password, hash);
        req.flash('info', 'successfully joined and logged in as ' + username);
        req.session.username = username;
        req.session.loggedIn = true;
        return res.redirect('/all');
    } catch (error) {
        req.flash('error', `Form submission error: ${error}`);
        return res.redirect('/')
    }
});

//Logging in existing user. 
app.post("/login", async (req, res) => {
    try {
        const username = req.body.username;
        const password = req.body.password;
        const db = await Connection.open(mongoUri, DBNAME);
        var existingUser = await db.collection(USERS).findOne({ username: username });
        console.log('user', existingUser);
        if (!existingUser) {
            req.flash('error', "Username does not exist - try again.");
            return res.redirect('/')
        }
        const match = await bcrypt.compare(password, existingUser.hash);
        console.log('match', match);
        if (!match) {
            req.flash('error', "Username or password incorrect - try again.");
            return res.redirect('/')
        }
        req.flash('info', 'successfully logged in as ' + username);
        req.session.username = username;
        req.session.loggedIn = true;
        console.log('login as', username);
        return res.redirect('/all');
    } catch (error) {
        req.flash('error', `Form submission error: ${error}`);
        return res.redirect('/')
    }
});

//Logging out user
app.post('/logout', (req, res) => {
    if (req.session.username) {
        req.session.username = null;
        req.session.loggedIn = false;
        req.flash('info', 'You are logged out');
        return res.redirect('/');
    } else {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect('/');
    }
});

// Search page for existing Nooks
app.get('/search/', async (req, res) => {
    // Checks if user is logged in
    if (!req.session.username) {
        req.flash('error', 'You are not logged in. Please log in.');
        return res.redirect("/");
    }
    return res.render('search.ejs');
}
);

// Results page for search results
app.get('/results/', async (req, res) => {
    console.log('Getting search results');

    // Checks if user is logged in
    if (!req.session.username) {
        req.flash('error', 'You are not logged in. Please log in.');
        return res.redirect("/");
    }

    //gets search from form
    let nookName = req.query.name;
    console.log(nookName);
    let wifi = req.query.wifi;
    let food = req.query.food;
    let location = req.query.location;
    let noise = req.query.noise;
    let outlets = req.query.outlets;
    let searchTags = [wifi, food, location, noise, outlets].filter(tag => tag != null && tag !== '' && tag != 'undefined');
    console.log("Searched tags: ", searchTags);
    console.log("Searched name: ", nookName);

    //connecting to MongoDB
    console.log('Connecting to MongoDB:', mongoUri);
    const db = await Connection.open(mongoUri, DBNAME);
    const nooks = db.collection(NOOKS);
    console.log('Connected to MongoDB');

    //searching the database based on form inputs
    let searchResults = [];
    //only searching by tags
    if(!nookName && searchTags.length == 0){
        return res.redirect('/all');
    }
    if (!nookName) {
        console.log("searching without nook name", searchTags);
        searchResults = await nooks.find({ tags: { $all: searchTags } }).toArray();

    //only searching by name
    } else if (searchTags.length == 0) {
        searchResults = await nooks.find({ name: { $regex: nookName, $options: 'i' } }).toArray();
    
    //searching by both name and tag
    } else {
        searchResults = await nooks.find({ name: { $regex: nookName, $options: 'i' }, tags: { $all: searchTags } }).toArray();
    }
    console.log("RESULTS: ", searchResults);
    await Connection.close();

    //renders results
    return res.render('results.ejs', { results: searchResults });
});

// Page to add nook
app.get('/add-nook/', async (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    return res.render('nookForm.ejs', {apiKey});
})

// Adding a new nook to database
app.post("/add-nook/", upload.single('nookPhoto'), async (req, res) => {
    // Defining variables for nook information from form.
    const poster = req.session.username;
    const nookName = req.body.nookName;
    const address = req.body.nookAddress;
    const rating = req.body.nookRating;
    const numRating = parseInt(rating);
    const wifi = req.body.wifiCheck;
    const wifiStatus = () => { return wifi ? "Wi-fi available" : "No wi-fi" }
    const outlet = req.body.outletCheck;
    const outletStatus = () => { return outlet ? "Outlet available" : "No outlet" }
    const campus = req.body.campusCheck;
    const campusStatus = () => { return campus ? "On-campus" : "Off-campus" }
    const food = req.body.foodCheck;
    const foodStatus = () => { return food ? "Food available" : "No fod available" }
    const date = new Date();

    // Database definitions
    const db = await Connection.open(mongoUri, DBNAME);
    const nooks = db.collection(NOOKS);

    let latest = await nooks.find().sort({ "nid": -1 }).toArray();
    const id = latest[0].nid + 1;

    console.log(numRating);

    if (address === "" || isNaN(numRating)) { //check that address and numRating are filled
        req.flash('error', 'Please fill out every field.');
        return res.render("nookForm.ejs", {apiKey});
    } else {
        // Updates movie in the database with changed information.
        let insertion = await nooks.insertOne({
            nid: id,
            name: nookName,
            address: address,
            poster: poster,
            rating: numRating,
            tags: [wifiStatus(), outletStatus(), foodStatus(), campusStatus()],
            reviews: [],
        });

        //adds photo to nook document if photo is uploaded
        if (req.file) {
            let photoInsert = await nooks.updateOne(
                { nid: { $eq: id } },
                { $push: { photos: '/uploads/' + req.file.filename, } }
            );
        }
        // Flashes confirmation and re-renders the update page and form.
        req.flash("info", "Your nook has been added.")
        res.redirect("/nook/" + id);
    }
});

// Individual nook page
app.get('/nook/:nookID', async (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    let nookID = req.params.nookID;
    nookID = Number(nookID);

    // Database definitions
    const db = await Connection.open(mongoUri, DBNAME);
    const nooks = db.collection(NOOKS);

    // Search database for chosen movie and bring it out of array
    let chosen = await nooks.find({ nid: { $eq: nookID } }).toArray();
    let nook = chosen[0];

    if (nook) {
        return res.render('nook.ejs',
            {
                nook: nook,
                rating: nook.rating,
                poster: nook.poster,
                tags: nook.tags,
                reviews: nook.reviews,
                address: nook.address,
                photos: nook.photos
            });
    } else {
        req.flash('error', 'This nook does not exist.')
        res.redirect('/all');
    }
});

//review page of the selected nook
app.get('/review/:nookID', async (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    let nookID = req.params.nookID;
    nookID = Number(nookID);

    // Search database for chosen movie and bring it out of array
    const db = await Connection.open(mongoUri, DBNAME);
    const nooks = db.collection(NOOKS);
    let chosen = await nooks.find({ nid: { $eq: nookID } }).toArray();
    let nook = chosen[0];
    if (nook) {
        return res.render('review.ejs',
            {
                nook: nook,
            });
    } else {
        req.flash('error', 'This nook does not exist.')
        res.redirect('/all');
    }
});

//post method for inserting review of nook
app.post('/review/:nookID', upload.single('nookPhoto'), async (req, res) => {
    console.log(req.body);
    console.log(req.file);
    
    let nookID = req.params.nookID;
    nookID = Number(nookID);

    // Search database for chosen movie and bring it out of array
    const db = await Connection.open(mongoUri, DBNAME);
    const nooks = db.collection(NOOKS);
    let chosen = await nooks.find({ nid: { $eq: nookID } }).toArray();
    let nook = chosen[0];

    //retrieves form data
    let rating = parseInt(req.body.nookRating);
    const wifi = req.body.wifiCheck;
    const wifiStatus = () => { return wifi ? "Wi-fi available" : "No wi-fi" }
    const outlet = req.body.outletCheck;
    const outletStatus = () => { return outlet ? "Outlet available" : "No outlet" }
    const food = req.body.foodCheck;
    const foodStatus = () => { return food ? "Food available" : "No Food" }
    let noise = req.body.noise;

    //add reviewID with earliest review being rid= 1
    let reviews = nook.reviews;
    let id = 1
    if (reviews.length == 0) {
        id = 1
    }
    else {
        id = reviews.length + 1;
    }
    //add review to database 
    let review = {
        rid: id,
        username: req.session.username,
        rating: rating,
        tags: [wifiStatus(), outletStatus(), foodStatus(), noise],
        text: req.body.text
    };
    let result = await nooks
        .updateOne(
            { nid: { $eq: nookID } },
            { $push: { reviews: review } }
        );

    //update info in nook to reflect tags in most recent review
    let campusStatus = nook.tags[nook.tags.length - 1] //grab campus status, assume this will be unchanging
    let update = await nooks
        .updateOne(
            { nid: { $eq: nookID } },
            {$set: {tags: [wifiStatus(), outletStatus(), foodStatus(), noise, campusStatus]}},
        );
        
    //update average rating in nook
    let totalRating = 0;
    reviews.forEach((elem) => {
        totalRating += elem.rating;
    })
    let averageRating = Math.round(totalRating/reviews.length); 
    if (reviews.length == 0) { //if there are no other reviews
        averageRating =  Math.round((nook.rating + rating)/2);
    };
    let updateReview = await nooks
        .updateOne(
            { nid: { $eq: nookID } },
            {$set: {rating: averageRating}}
        );
    
    //adds photo to nook document if photo is uploaded
    let photo = '/uploads/' + req.file.filename;
    if (req.file) {
        let photoInsert = await nooks.updateOne(
            { nid: { $eq: nookID } },
            { $push: { photos: photo } }
        );
    }
    
    req.flash('info', 'Successfully added review!');
    return res.redirect(`/nook/${nookID}`);
});

// redirects you to the review page of the selected nook
app.get('/get-review/', async (req, res) => {
    let nid = parseInt(req.query.nid);
    console.log(nid);
    return res.redirect(`/review/${nid}`);
})

//map page, currently in progress
app.get('/map/', (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    console.log('map view');
    return res.render('map.ejs');
});
//profile page, currently in progress
app.get('/profile/', async (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    console.log('profile page');
    return res.render('profile.ejs', { username: req.session.username });
});

//retrieves all nooks and lists them on the nooks home page
app.get('/all/', async (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    const db = await Connection.open(mongoUri, DBNAME);
    let all = await db.collection(NOOKS).find().toArray();
    console.log('len', all.length, 'first', all[0]);
    console.log('all nooks');
    await Connection.close();
    //returns nooks to list them on the list.ejs page
    return res.render('list.ejs', { listDescription: 'All Nooks', list: all });
});

// ================================================================
// postlude

const serverPort = cs304.getPort(8080);

// this is last, because it never returns
app.listen(serverPort, function () {
    console.log(`open http://localhost:${serverPort}`);
});
