const express = require('express');
const router = express.Router();
const knex = require('../db/knex');

function ensureAuthenticated(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.redirect('/signin');
  }
  next();
}

/*router.get('/', function (req, res, next) {
  const isAuth = req.isAuthenticated();
  if (!isAuth) {
    return res.render('index', {
      title: 'ToDo App',
      todos: [],
      isAuth: false,
    });
  }

  knex('tasks')
    .select('*')
    .where({ user_id: req.user.id })
    .then(function (results) {
      res.render('index', {
        title: 'ToDo App',
        todos: results,
        isAuth: true,
      });
    })
    .catch(function (err) {
      console.error(err);
      res.render('index', {
        title: 'ToDo App',
        isAuth: true,
        errorMessage: [err.sqlMessage],
      });
    });
});
*/

router.get('/', function (req, res, next) {
  const isAuth = req.isAuthenticated();
  if (isAuth) {
    const userId = req.user.id;
    knex("tasks")
      .select("*")
      .where({user_id: userId})
      .then(function (results) {
        res.render('index', {
          title: 'ToDo App',
          todos: results,
          isAuth: isAuth,
        });
      })
      .catch(function (err) {
        console.error(err);
        res.render('index', {
          title: 'ToDo App',
          isAuth: isAuth,
          errorMessage: [err.sqlMessage],
        });
      });
  } else {
    res.render('index', {
      title: 'ToDo App',
      isAuth: isAuth,
    });
  }
});

router.post('/', ensureAuthenticated, function (req, res, next) {
  const userId = req.user.id;
  const todo = req.body.add;
  knex('tasks')
    .insert({ user_id: userId, content: todo })
    .then(function () {
      res.redirect('/');
    })
    .catch(function (err) {
      console.error(err);
      res.render('index', {
        title: 'ToDo App',
        isAuth: true,
        errorMessage: [err.sqlMessage],
      });
    });
});

router.use('/signup', require('./signup'));
router.use('/signin', require('./signin'));
router.use('/logout', require('./logout'));

module.exports = router;