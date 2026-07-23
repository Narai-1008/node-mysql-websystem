const express = require('express');
const router = express.Router();
const knex = require('../db/knex');

function ensureAuthenticated(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.redirect('/signin');
  }
  next();
}

async function ensurePostponeCountColumn() {
  const exists = await knex.schema.hasColumn('tasks', 'postpone_count');
  if (!exists) {
    await knex.schema.table('tasks', function (table) {
      table.integer('postpone_count').notNullable().defaultTo(0);
    });
  }
}

async function ensureCompletedColumn() {
  const exists = await knex.schema.hasColumn('tasks', 'completed');
  if (!exists) {
    await knex.schema.table('tasks', function (table) {
      table.boolean('completed').notNullable().defaultTo(false);
    });
  }
}

async function ensureDueDateColumn() {
  const exists = await knex.schema.hasColumn('tasks', 'due_date');
  if (!exists) {
    await knex.schema.table('tasks', function (table) {
      table.date('due_date').nullable();
    });
  }
}

async function ensureMoodLogTable() {
  const exists = await knex.schema.hasTable('mood_logs');
  if (!exists) {
    await knex.schema.createTable('mood_logs', function (table) {
      table.increments('id').primary();
      table.integer('user_id').notNullable();
      table.date('mood_date').notNullable();
      table.enu('mood', ['happy', 'neutral', 'tired']).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['user_id', 'mood_date']);
    });
  }
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

router.get('/', async function (req, res, next) {
  const isAuth = req.isAuthenticated();
  if (isAuth) {
    try {
      await ensurePostponeCountColumn();
      await ensureCompletedColumn();
      await ensureDueDateColumn();
      await ensureMoodLogTable();
      const userId = req.user.id;
      const today = formatDate(new Date());
      const todosPromise = knex('tasks').select('*').where({ user_id: userId });
      const rankingPromise = knex('tasks')
        .select('content', 'postpone_count')
        .where({ user_id: userId })
        .orderBy('postpone_count', 'desc')
        .limit(3);
      const moodHistoryPromise = knex('mood_logs')
        .select('mood_date', 'mood')
        .where({ user_id: userId })
        .orderBy('mood_date', 'desc')
        .limit(14);
      const todayMoodPromise = knex('mood_logs')
        .select('mood')
        .where({ user_id: userId, mood_date: today })
        .first();

      const [todos, topPostponed, moodHistory, todayMood] = await Promise.all([
        todosPromise,
        rankingPromise,
        moodHistoryPromise,
        todayMoodPromise,
      ]);

      const formattedTodos = todos.map(function (task) {
        let formatted_due_date = null;
        if (task.due_date) {
          const dueDate = new Date(task.due_date);
          const year = dueDate.getFullYear();
          const month = dueDate.getMonth() + 1;
          const day = dueDate.getDate();
          formatted_due_date = `${year}年${month}月${day}日`;
        }
        return Object.assign({}, task, { formatted_due_date: formatted_due_date });
      });

      const moodHistoryFormatted = moodHistory.map(function (log) {
        const date = new Date(log.mood_date);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return {
          mood_date: log.mood_date,
          formatted_date: `${year}年${month}月${day}日`,
          mood: log.mood,
        };
      });

      res.render('index', {
        title: 'ToDo App',
        todos: formattedTodos,
        topPostponed: topPostponed,
        moodHistory: moodHistoryFormatted,
        todayMood: todayMood,
        todayDate: today,
        isAuth: isAuth,
      });
    } catch (err) {
      console.error(err);
      res.render('index', {
        title: 'ToDo App',
        isAuth: isAuth,
        errorMessage: [err.sqlMessage],
      });
    }
  } else {
    res.render('index', {
      title: 'ToDo App',
      isAuth: isAuth,
    });
  }
});

router.post('/', ensureAuthenticated, async function (req, res, next) {
  try {
    await ensurePostponeCountColumn();
    await ensureCompletedColumn();
    await ensureDueDateColumn();
    const userId = req.user.id;
    const todo = req.body.add;
    const dueDate = req.body.due_date || null;
    await knex('tasks').insert({ user_id: userId, content: todo, completed: false, due_date: dueDate });
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('index', {
      title: 'ToDo App',
      isAuth: true,
      errorMessage: [err.sqlMessage],
    });
  }
});

router.post('/complete/:taskId', ensureAuthenticated, async function (req, res, next) {
  try {
    await ensureCompletedColumn();
    const taskId = req.params.taskId;
    const userId = req.user.id;
    const task = await knex('tasks')
      .select('completed')
      .where({ id: taskId, user_id: userId })
      .first();
    if (task) {
      await knex('tasks')
        .where({ id: taskId, user_id: userId })
        .update({ completed: !task.completed });
    }
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('index', {
      title: 'ToDo App',
      isAuth: true,
      errorMessage: [err.sqlMessage],
    });
  }
});

router.post('/delete/:taskId', ensureAuthenticated, async function (req, res, next) {
  try {
    const taskId = req.params.taskId;
    const userId = req.user.id;
    await knex('tasks')
      .where({ id: taskId, user_id: userId })
      .del();
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('index', {
      title: 'ToDo App',
      isAuth: true,
      errorMessage: [err.sqlMessage],
    });
  }
});

router.post('/mood', ensureAuthenticated, async function (req, res, next) {
  try {
    await ensureMoodLogTable();
    const userId = req.user.id;
    const mood = req.body.mood;
    const validMoods = ['happy', 'neutral', 'tired'];
    if (!validMoods.includes(mood)) {
      throw new Error('無効なやる気の値です。');
    }
    const today = formatDate(new Date());
    const existing = await knex('mood_logs')
      .where({ user_id: userId, mood_date: today })
      .first();
    if (existing) {
      await knex('mood_logs')
        .where({ id: existing.id })
        .update({ mood: mood });
    } else {
      await knex('mood_logs').insert({ user_id: userId, mood_date: today, mood: mood });
    }
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('index', {
      title: 'ToDo App',
      isAuth: true,
      errorMessage: [err.message || err.sqlMessage],
    });
  }
});

router.post('/postpone/:taskId', ensureAuthenticated, async function (req, res, next) {
  try {
    await ensurePostponeCountColumn();
    const taskId = req.params.taskId;
    const userId = req.user.id;
    await knex('tasks')
      .where({ id: taskId, user_id: userId })
      .increment('postpone_count', 1);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('index', {
      title: 'ToDo App',
      isAuth: true,
      errorMessage: [err.sqlMessage],
    });
  }
});

router.use('/signup', require('./signup'));
router.use('/signin', require('./signin'));
router.use('/logout', require('./logout'));

module.exports = router;