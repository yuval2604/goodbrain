var express     = require("express");
var router  = express.Router();
var Exercise    =require("../models/exercise");
var Comment     =require("../models/comment");
var middleware = require("../middleware");
// var multer      = require("multer");
// var upload      = multer({dest: 'public/'});



//INDEX - show all exercises
router.get("/", function(req, res){
    // Get all exercises from DB
    Exercise.find({}, function(err, allExercises){
       if(err){
           console.log(err);
       } else {
          res.render("exercises/index",{exercises:allExercises});
       }
    });
});

//CREATE - add new exercise to DB
router.post("/",isLoggedIn, function(req, res){
    // get data from form and add to exercises array
    var name = req.body.name;
    var image = req.body.image;
    var desc = req.body.description;
    var author = {
        id: req.user._id,
        username: req.user.username
    }
    var newExercise = {name: name, image: image, description: desc, author:author}
   // res.send(req.files);
    
    console.log(req.user)// contains the information about the user
    
    // Create a new exercise and save to DB
    Exercise.create(newExercise, function(err, newlyCreated){
        if(err){
            console.log(err);
        } else {
            //redirect back to exercises page
            res.redirect("/exercises");
        }
    });
});

//NEW - show form to create new exercise
router.get("/new",isLoggedIn, function(req, res){
   res.render("exercises/new"); 
});

// SHOW - shows more info about one exercise
router.get("/:id", function(req, res){
    //find the exercise with provided ID
    Exercise.findById(req.params.id).populate("comments").exec(function(err, foundExercise){
        if(err){
            console.log(err);
        } else {
            console.log(foundExercise)
            //render show template with that exercise
            res.render("exercises/show", {exercise: foundExercise});
        }
    });
});


// EDIT Exercise ROUTE
router.get("/:id/edit", middleware.checkExerciseOwnership, function(req, res){
    Exercise.findById(req.params.id, function(err, foundExercise){
        res.render("exercises/edit", {exercise: foundExercise});
    });
});

// req.isAuthenticated()  The way to find out if the user is logged in

// UPDATE Exercise ROUTE
router.put("/:id",middleware.checkExerciseOwnership, function(req, res){
    // find and update the correct campground
    Exercise.findByIdAndUpdate(req.params.id, req.body.exercise, function(err, updatedExercise){
       if(err){
           res.redirect("/exercises");
       } else {
           //redirect somewhere(show page)
           res.redirect("/exercises/" + req.params.id);
       }
    });
});


// DESTROY CAMPGROUND ROUTE
router.post("/:id/delete", middleware.checkExerciseOwnership,function(req, res){
   Exercise.findByIdAndRemove(req.params.id, function(err){
      if(err){
          res.redirect("/exercises");
      } else {
          res.redirect("/exercises");
      }
   });
});


//middleware
function isLoggedIn(req, res, next){
    if(req.isAuthenticated()){
        return next();
    }
    res.redirect("/login");
}

module.exports = router ;
