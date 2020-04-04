var mongoose = require("mongoose");
var Exercise = require("./models/exercise");
var Comment = require("./models/comment");

var data = [
  {
    name: "Cloud's Rest",
    image:
      "https://images.unsplash.com/photo-1545624770-2f7822d4601f?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=800&q=60",
    description: "Lorem ipsum dolor sit amet, consectetur adipisicing elit",
  },
  {
    name: "Cloud's Rest",
    image:
      "https://images.unsplash.com/photo-1545624770-2f7822d4601f?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=800&q=60",
    description: "Lorem ipsum dolor sit amet, consectetur adipisicing elit",
  },
  {
    name: "Desert Mesa",
    image:
      "https://images.unsplash.com/photo-1545559054-8f4f9e855781?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=800&q=60",
    description: "Lorem ipsum dolor sit amet, consectetur adipisicing elit",
  },
  {
    name: "Canyon Floor",
    image:
      "https://images.unsplash.com/photo-1545621502-58d330faebb1?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=800&q=60",
    description: "Lorem ipsum dolor sit amet, consectetur adipisicing elit",
  },
];

data = [];

function seedDB() {
  // Remove all exercises
  Exercise.remove({}, function (err) {
    if (err) {
      console.log(err);
    }
    console.log("removed exercise!");
    //add a few exercises
    data.forEach(function (seed) {
      Exercise.create(seed, function (err, exercise) {
        if (err) {
          console.log(err);
        } else {
          console.log("added a exercise");
          //create a comment
          Comment.create(
            {
              text: "This place is great, but I wish there was internet",
              author: "Homer",
            },
            function (err, comment) {
              if (err) {
                console.log(err);
              } else {
                exercise.comments.push(comment);
                exercise.save();
                console.log("Created new comment");
              }
            }
          );
        }
      });
    });
  });
  //  add a few comments
}

module.exports = seedDB;
