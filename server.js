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
const coordGeocoder = require('node-geocoder');
require('dotenv').config();
const apiKey = AIzaSyD_i0v65GU6owvHnlwZm3Ip5E-GgWMozOg;

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
    limits: { fileSize: 200_000_000 }
});


//for map view 

const options = {
    provider: 'google',
    apiKey: apiKey,
};

const geocoder = coordGeocoder(options);

// ================================================================
// custom routes here

const DB = process.env.USER;
const DBNAME = "nooks_db";
const NOOKS = "nooks";
const USERS = "users";

/**
 * Main page. Prompts user to login or create a login
 */
app.get('/', (req, res) => {
    return res.render('index.ejs');
});

/**
 * Adding a new user. Adds username and password to user collection
 */
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

/**
 * Logging in existing user. 
 */
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

/**
 * Logging out user
 */
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

/**
 * Search page for existing Nooks
 */
app.get('/search/', async (req, res) => {
    // Checks if user is logged in
    if (!req.session.username) {
        req.flash('error', 'You are not logged in. Please log in.');
        return res.redirect("/");
    }
    return res.render('search.ejs');
});

/**
 * Results page for search results
 */
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
    if (!nookName && searchTags.length == 0) {
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

    //message if the query doesn't match any nooks in the database
    if (searchResults.length == 0) {
        req.flash("error", "Your query doesn't match any of our current nooks")
        return res.render("search.ejs");
    }

    console.log("RESULTS: ", searchResults.length);
    await Connection.close();

    //renders results
    return res.render('results.ejs', { results: searchResults });
});

/**
 * Page to add nook
 */
app.get('/add-nook/', async (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    return res.render('nookForm.ejs', { apiKey });
})

/**
 * Adding a new nook to database
 */
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
    const foodStatus = () => { return food ? "Food available" : "No food available" }
    const noise = req.body.noiseCheck;
    const noiseStatus = () => {
        if (noise === "average") {
            return "Average noisiness";
        } else if (noise === "quiet") {
            return "Usually quiet";
        } else {
            return "Usually noisy"
        }
    }
    const date = new Date();

    // Database definitions
    const db = await Connection.open(mongoUri, DBNAME);
    const nooks = db.collection(NOOKS);

    let latest = await nooks.find().sort({ "nid": -1 }).toArray();
    const id = latest[0].nid + 1;

    console.log(numRating);

    //geocoding address


    if (address === "" || isNaN(numRating)) { //check that address and numRating are filled
        req.flash('error', 'Please fill out every field.');
        return res.render("nookForm.ejs", { apiKey });
    } else {
        // Updates movie in the database with changed information.
        let insertion = await nooks.insertOne({
            nid: id,
            name: nookName,
            address: address,
            poster: poster,
            rating: numRating,
            tags: [wifiStatus(), outletStatus(), foodStatus(), campusStatus(), noiseStatus()],
            reviews: [],
            photos: [],
            likes: 0
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

/**
 * Individual nook page
 * Displays average rating, tags, reviews, photos, and 
 * button to leave review
 */
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

    // Search database for chosen nook and bring it out of array
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

/**
 * Review page of the selected nook
 * Prompts user to leave rating, mark tags, add review, and upload photo.
 * Rating and review is required. Photo is optional. 
 */
app.get('/review/:nookID', async (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    let nookID = req.params.nookID;
    nookID = Number(nookID);

    // Search database for chosen nook and bring it out of array
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

/**
 * Post method for inserting review of nook.
 * Average rating of review is updated.
 */
app.post('/review/:nookID', upload.single('nookPhoto'), async (req, res) => {
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
        let sorted = reviews.sort(function (first, second) {
            return second.rid - first.rid;
        })
        id = sorted[0].rid + 1;
    }

    //review document
    let review = {
        rid: id,
        username: req.session.username,
        rating: rating,
        tags: [wifiStatus(), outletStatus(), foodStatus(), noise],
        text: req.body.text
    };

    //adds photo to nook document if photo is uploaded
    if (req.file) {
        let photo = '/uploads/' + req.file.filename;
        let photoInsert = await nooks.updateOne(
            { nid: { $eq: nookID } },
            { $push: { photos: photo } }
        );
        review['photo'] = photo;
    }

    //add review document to nooks
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
            { $set: { tags: [wifiStatus(), outletStatus(), foodStatus(), noise, campusStatus] } },
        );

    //update average rating in nook
    let totalRating = 0;
    reviews.forEach((elem) => {
        totalRating += elem.rating;
    })
    let averageRating = Math.round(totalRating / reviews.length);
    if (reviews.length == 0) { //if there are no other reviews
        averageRating = Math.round((nook.rating + rating) / 2);
    };
    let updateReview = await nooks
        .updateOne(
            { nid: { $eq: nookID } },
            { $set: { rating: averageRating } }
        );

    req.flash('info', 'Successfully added review!');
    return res.redirect(`/nook/${nookID}`);
});

/**
 * Page to edit a review.
 * Form pre-populates with previous review information.
 */
app.get('/edit/:nid/:rid', async (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    const db = await Connection.open(mongoUri, DBNAME);
    const nooks = db.collection(NOOKS);
    console.log('testing params', req.params.nid);
    let nid = parseInt(req.params.nid);
    let rid = parseInt(req.params.rid);

    let nook = await nooks.findOne({ nid: nid });
    let reviews = nook.reviews;
    let myReview;
    reviews.forEach((review) => {
        if (review.rid == rid) {
            myReview = review;
        }
    });
    console.log('myreview', myReview)
    //check that user is editing their own review
    if (req.session.username != myReview.username) {
        req.flash('error', 'Permission denied');
        return res.redirect("/all");
    }
    return res.render('editReview.ejs', { nook: nook, review: myReview });
})

/**
 * Update database with edited review
 */
app.post('/edit/:nid/:rid', async (req, res) => {
    let nid = parseInt(req.params.nid);
    let rid = parseInt(req.params.rid);
    console.log('rid', rid);

    // Search database for chosen movie and bring it out of array
    const db = await Connection.open(mongoUri, DBNAME);
    const nooks = db.collection(NOOKS);

    //retrieves form data
    let rating = parseInt(req.body.nookRating);
    const wifi = req.body.wifiCheck;
    const wifiStatus = () => { return wifi ? "Wi-fi available" : "No wi-fi" }
    const outlet = req.body.outletCheck;
    const outletStatus = () => { return outlet ? "Outlet available" : "No outlet" }
    const food = req.body.foodCheck;
    const foodStatus = () => { return food ? "Food available" : "No Food" }
    let noise = req.body.noise;

    //update review in database 
    let update = await nooks
        .updateOne(
            { nid: nid, 'reviews.rid': rid },
            {
                $set: {
                    'reviews.$.rating': rating,
                    'reviews.$.tags': [wifiStatus(), outletStatus(), foodStatus(), noise],
                    'reviews.$.text': req.body.text
                }
            }
        );

    //update info in nook to reflect tags in most recent review
    let nook = await nooks.findOne({ nid: nid });
    let campusStatus = nook.tags[nook.tags.length - 1] //grab campus status, assume this will be unchanging
    let updateInfo = await nooks
        .updateOne(
            { nid: { $eq: nid } },
            { $set: { tags: [wifiStatus(), outletStatus(), foodStatus(), noise, campusStatus] } },
        );

    //update average rating in nook
    let totalRating = 0;
    let reviews = nook.reviews;
    reviews.forEach((elem) => {
        totalRating += elem.rating;
    })
    let averageRating = Math.round(totalRating / reviews.length);
    if (reviews.length == 0) { //if there are no other reviews
        averageRating = Math.round((nook.rating + rating) / 2);
    };
    let updateReview = await nooks
        .updateOne(
            { nid: { $eq: nid } },
            { $set: { rating: averageRating } }
        );

    req.flash('info', 'Successfully updated review!');
    return res.redirect(`/nook/${nid}`);
});

/**
 * Deletes user review from database.
 * If there is a photo, it is deleted from uploads folder
 */
app.post('/delete/:nid/:rid', async (req, res) => {
    let nid = parseInt(req.params.nid);
    let rid = parseInt(req.params.rid);

    // Search database for chosen movie and bring it out of array
    const db = await Connection.open(mongoUri, DBNAME);
    const nooks = db.collection(NOOKS);

    //get photo path and deletes from nook
    let nook = await nooks.findOne({ nid: nid });
    let myReview;
    nook.reviews.forEach((review) => {
        if (review.rid == rid) {
            myReview = review;
        }
    });
    let photo;
    if (myReview.photo) {
        photo = myReview.photo; //photo path
        //remove photo file from uploads folder
        var fs = require('fs');
        fs.unlink('.' + photo, function (err) {
            if (err) { return console.error(err) }
        });
        //remove photo from nook document
        let update = await nooks.updateOne(
            { nid: nid },
            { $pull: { photos: photo } }
        )
    }

    //delete review from database
    let update = await nooks
        .updateOne(
            { nid: nid },
            { $pull: { reviews: { rid: rid } } }
        );

    //update average rating in nook
    let totalRating = 0;
    let reviews = nook.reviews;
    reviews.forEach((elem) => {
        totalRating += elem.rating;
    })
    let averageRating = Math.round(totalRating / reviews.length);
    if (reviews.length == 0) { //if there are no other reviews
        averageRating = nook.rating;
    };
    let updateReview = await nooks
        .updateOne(
            { nid: { $eq: nid } },
            { $set: { rating: averageRating } }
        );

    req.flash('info', 'Successfully deleted review');
    return res.redirect(`/nook/${nid}`);
});

/**
 * Redirects to the review page of the selected nook
 */
app.get('/get-review/', async (req, res) => {
    let nid = parseInt(req.query.nid);
    return res.redirect(`/review/${nid}`);
})

/**when users navigate to the map page, this route renders map.ejs passing the apikey
 * eventually it will also pass an array of all the titles and coordinates of nooks
 * to be placed as markers on the map
 **/
app.get('/map/', (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    console.log('map view');
    return res.render('map.ejs', { apiKey: apiKey });
});

/**
 * Profile page, consisting of user reviews and logout button
 */
app.get('/profile/', async (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    console.log('profile page');
    const db = await Connection.open(mongoUri, DBNAME);
    const nooks = db.collection(NOOKS);
    let userLikes = await db.collection(USERS).find({username:req.session.username}).toArray();
    userLikes = userLikes[0];

    //get user reviews
    const allNooks = await db.collection(NOOKS).find().toArray();
    let userLikesNooks = [];
    allNooks.forEach((nook) => {
        if (String(nook.nid) in userLikes.likes) {
            userLikesNooks.push(nook);
        }
    })

    let userNooks = await nooks.find({ 'reviews.username': req.session.username }).toArray();
    return res.render('profile.ejs',
        { username: req.session.username, userNooks: userNooks, userLikes: userLikesNooks });
});

/**
 * retrieves all nooks and lists them on the nooks home page
 */
app.get('/all/', async (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    const db = await Connection.open(mongoUri, DBNAME);
    let all = await db.collection(NOOKS).find().toArray();
    let liked = await db.collection(USERS).find({username:req.session.username}).toArray();
    liked = liked[0].likes;
    
    // console.log('len', all.length, 'first', all[0]);
    console.log('all nooks');
    await Connection.close();
    //returns nooks to list them on the list.ejs page
    return res.render('list.ejs', { listDescription: 'All Nooks', list: all, likes: liked });
});


//for adding coords to object
async function geocodeAddress(address) {
    try {
        const res = await geocoder.geocode(address);
        if (res.length === 0) {
            throw new Error('No results found for the address.');
        }
        return {
            latitude: res[0].latitude,
            longitude: res[0].longitude
        };
    } catch (error) {
        console.error('Error geocoding address:', error);
        throw error;
    }
}

app.post('/like/:nid', async (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }

    const nid = parseInt(req.params.nid);

    const db = await Connection.open(mongoUri, DBNAME);
    let userfind = await db.collection(USERS).find({ username: req.session.username }).toArray();
    let change;
    console.log(userfind)

    if (!('likes' in userfind[0])) {
        const addlikes = await db.collection(USERS).updateOne({ username: req.session.username }, { $set: { likes: {} } });
        userfind = await db.collection(USERS).find({ username: req.session.username }).toArray()
    }

    if (nid in userfind[0].likes) {
        const userres = await db.collection(USERS).updateOne({ username: req.session.username },
            { $unset: { [`likes.${nid}`]: 1 } },
            { upsert: false });

        const result = await db.collection(NOOKS).updateOne({ nid: nid },
            { $inc: { likes: -1 } },
            { upsert: false });
        change = false;
    } else {
        const userres = await db.collection(USERS).updateOne({ username: req.session.username },
            { $set: { [`likes.${nid}`]: true } },
            { upsert: false });

        const result = await db.collection(NOOKS).updateOne({ nid: nid },
            { $inc: { likes: 1 } },
            { upsert: false });
        change = true;
    }

    const likes = await db.collection(NOOKS).find({nid:nid}).toArray()
    console.log(likes)

    return res.json({ change: change, nid: nid, likes: likes[0].likes});
})


// ================================================================
// postlude

const serverPort = cs304.getPort(8080);

// this is last, because it never returns
app.listen(serverPort, function () {
    console.log(`open http://localhost:${serverPort}`);
});
