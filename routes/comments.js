var express     = require("express");
var router  = express.Router({mergeParams: true});
var Exercise    =require("../models/exercise");
var Comment     =require("../models/comment");
var middleware = require("../middleware");


// ====================
// COMMENTS ROUTES
// ====================

router.get("/new", isLoggedIn ,function(req, res){
    // find exercise by id
    Exercise.findById(req.params.id, function(err, exercise){
        if(err){
            console.log(err);
        } else {
             res.render("comments/new", {exercise: exercise});
        }
    })
});

router.post("/", isLoggedIn , function(req, res){
   //lookup exercise using ID
   Exercise.findById(req.params.id, function(err, exercise){
       if(err){
           console.log(err);
           res.redirect("/exercises");
       } else {
        Comment.create(req.body.comment, function(err, comment){
           if(err){
               console.log(err);
           } else {
               // add username and id to comment
               comment.author.id= req.user._id;
               comment.author.username=req.user.username;
               //save comment
               comment.save();
               exercise.comments.push(comment);
               exercise.save();
               res.redirect('/exercises/' + exercise._id);
           }
        });
       }
   });
   //create new comment
   //connect new comment to exercise
   //redirect exercise show page
});


// COMMENT EDIT ROUTE
router.get("/:comment_id/edit", middleware.checkCommentOwnership, function(req, res){
   Comment.findById(req.params.comment_id, function(err, foundComment){
      if(err){
          res.redirect("back");
      } else {
        res.render("comments/edit", {exercise_id: req.params.id, comment: foundComment});
      }
   });
});

// COMMENT UPDATE
router.put("/:comment_id", middleware.checkCommentOwnership, function(req, res){
   Comment.findByIdAndUpdate(req.params.comment_id, req.body.comment, function(err, updatedComment){
      if(err){
          res.redirect("back");
      } else {
          res.redirect("/exercises/" + req.params.id );
      }
   });
});

// COMMENT DESTROY ROUTE
router.delete("/:comment_id", middleware.checkCommentOwnership, function(req, res){
    //findByIdAndRemove
    Comment.findByIdAndRemove(req.params.comment_id, function(err){
       if(err){
           res.redirect("back");
       } else {
           res.redirect("/exercises/" + req.params.id);
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
