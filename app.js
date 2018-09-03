var express     = require("express"),
    app         = express(),
    bodyParser  = require("body-parser"),
    mongoose    = require("mongoose"),
    passport    = require("passport"),
    LocalStrategy = require("passport-local"),
    methodOverride = require("method-override"),
    Exercise  = require("./models/exercise"),
    Comment     = require("./models/comment"),
    User        = require("./models/user"),
    seedDB      = require("./seeds")

//requring routes    
var commentRoutes= require("./routes/comments"),
    exerciseRoutes= require("./routes/exercises"),
    indexRoutes = require("./routes/index");
    
//mongoose.connect("mongodb://localhost/Goodbrain");

mongoose.connect("mongodb://Yuval:yuval2604@ds143262.mlab.com:43262/goodbrain");

 // mongodb://yuval:yuval2604@ds143262.mlab.com:43262/goodbrain

app.use(bodyParser.urlencoded({extended: true}));
app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));
app.use(methodOverride("_method"));
seedDB();


// PASSPORT CONFIGURATION
app.use(require("express-session")({
    secret: "Once again Rusty wins cutest dog!",
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use(function(req, res, next){
   res.locals.currentUser = req.user;
   next();
});

app.use("/", indexRoutes);
app.use("/exercises", exerciseRoutes);
app.use("/exercises/:id/comments", commentRoutes);



app.listen(process.env.PORT, process.env.IP, function(){
   console.log("The GoodBrain Server Has Started!");
});

