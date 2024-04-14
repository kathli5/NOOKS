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


app.use(serveStatic('public'));
app.set('view engine', 'ejs');

const mongoUri = cs304.getMongoUri();

app.use(cookieSession({
    name: 'session',
    keys: ['horsebattery'],
    // Cookie Options
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
}));

const ROUNDS = 10;

// ================================================================
// custom routes here

const DB = process.env.USER;
const WMDB = 'wmdb';
const STAFF = 'staff';
const DBNAME = "nooks_db"; //change to our database 
const NOOKS = "nooks";
const USERS = "users"; //change to our users

// main page. This shows the use of session cookies
app.get('/', (req, res) => {
    let uid = req.session.uid || 'unknown';
    let visits = req.session.visits || 0;
    visits++;
    req.session.visits = visits;
    console.log('uid', uid);
    return res.render('index.ejs', { uid, visits });
});

// main page. This shows the use of session cookies
app.get('/', (req, res) => {
    return res.render('index.ejs', { uid, visits });
});

//LOGIN
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

// two kinds of forms (GET and POST), both of which are pre-filled with data
// from previous request, including a SELECT menu. Everything but radio buttons

app.get('/search/', async (req, res) => {
    console.log('get search form');
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    let nookName = req.query.title;
    let wifiTag = req.query.wifi;
    let foodTag = req.query.food;
    let outletTag = req.query.outlets;

    console.log('You submitted a search with this name: ' + nookName);
    console.log('You submitted a search with the following tags: ' + 
    wifiTag, foodTag, outletTag);
    const db = await Connection.open(mongoUri, DBNAME);
    let searchResults = await db.collection(NOOKS).find(
        {$or: [{name: {'$regex': nookName, '$options': 'gi'}},
        {}]}
    )

    await Connection.close();

    return res.render('search.ejs', { action: '/search/', data: req.query });
});

app.get('/results/', async (req, res) => {
    console.log('search form results');
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    let title = req.query.title;
    let wifi = req.query.wifi;
    let food = req.query.food;
    let location = req.query.location;
    let noise = req.query.noise;
    console.log(wifi, location)
    let searchTags = [wifi, food, location, noise].filter(tag => tag != null && tag !== '' && tag != 'undefined');
    console.log(searchTags);
    console.log('Connecting to MongoDB:', mongoUri);
    const db = await Connection.open(mongoUri, DBNAME);
    const nooks = db.collection(NOOKS);
    console.log('Connected to MongoDB');
    let results = await nooks.find({ tags: { $all: searchTags } }).toArray();
    console.log(results);
    await Connection.close();
    return res.render('results.ejs', { results: results });
});

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
            nook:nook,
            rating: nook.rating,
            poster: nook.poster,
            tags: nook.tags,
            reviews: nook.reviews,
            address: nook.address,
            photos: nook.photos
        });
    } else {
        req.flash('error', 'This nook does not exist.')
        res.redirect('/');
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
        res.redirect('/');
    }
})

// redirects you to the review page of the selected nook
app.get('/get-review/', async (req, res) => {
    let nid = parseInt(req.query.nid);
    console.log(nid);
    return res.redirect(`/review/${nid}`);
})

app.get('/map/', (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    console.log('map view');
    return res.render('map.ejs');
});

app.get('/profile/', (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    console.log('profile page');
    return res.render('profile.ejs', { username: req.session.username });
});

//all nooks 
app.get('/all/', async (req, res) => {
        if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    const db = await Connection.open(mongoUri, DBNAME);
    const nooks = await db.collection(NOOKS);
    let all = await nooks.find({}).sort({name: 1}).toArray();
    console.log('len', all.length, 'first', all[0]);
    console.log('all nooks');
    await Connection.close();
    return res.render('list.ejs', { listDescription: 'All Nooks', list: all});
});

// ================================================================
// postlude

const serverPort = cs304.getPort(8080);

// this is last, because it never returns
app.listen(serverPort, function () {
    console.log(`open http://localhost:${serverPort}`);
});
