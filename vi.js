#!/usr/bin/env node

var fs = require('fs');
var assert = require('assert');
var ANSITerm = require('../node-ansiterm/ansiterm').ANSITerm;

var CONFIG = {};
try {
  CONFIG = require('./config.json');
} catch (ex) {
}


var at = new ANSITerm();

var V = {
  mode: 'EDIT',
  cmd: {
    buf: '',
    hist: []
  },
  edit: {
    x: 0,
    y: 0,
    memx: 0
  },
  buf: [''],
  dirty: false,
  ins: {
    buf: '',
    over: 0,
    dest: 0
  },
  files: [],
  path: null,
  set: {
    linenumbers: CONFIG.linenumbers ? true : false
  }
};

function rpad(x, l)
{
  x = '' + x;
  while (x.length < l)
    x = ' ' + x;
  return x;
}

function redraw()
{
  at.clear();
  var sz = at.size();
  at.moveto(1, 1);
  var bufpos = -1;
  for (var y = 1; y < sz.h; y++) {
    at.moveto(1, y);
    if (++bufpos < V.buf.length) {
      if (V.set.linenumbers)
        at.write(rpad(bufpos + 1, 4) + ' ');
      at.write(V.buf[bufpos]);
    } else {
      at.write('~');
    }
  }
  moveToEditPoint();
}

function moveToEditPoint()
{
  at.moveto(V.edit.x + 1 + (V.set.linenumbers ? 5 : 0), V.edit.y + 1);
}

var DEBUG = false;
function modeSwitch(nmode)
{
  if (nmode !== 'EDIT')
    assert.notStrictEqual(nmode, V.mode);
  var sz = at.size();

  switch (nmode) {
    case 'COMMAND':
      at.reset();
      at.moveto(1, -1);
      at.eraseLine();
      at.write(':');
      break;
    case 'EDIT':
      if (V.mode === 'INSERT')
        V.edit.x--;
      V.edit.memx = V.edit.x;
      at.reset();
      at.replaceMode();
      moveToEditPoint();

      if (DEBUG) {
        at.moveto(1, 5);
        at.reverse();
        at.write('edit buffer:');
        at.moveto(1, 6);
        at.reset();
        at.write(V.buf[V.edit.y]);
        moveToEditPoint();
      }

      break;
    case 'INSERT':
      V.dirty = true;
      at.reset();
      moveToEditPoint();
      V.ins.buf = '';
      V.ins.over = 0;
      V.ins.dest = V.edit.x;
      imodeMode();
      break;
    
    case 'APPEND':
      V.dirty = true;
      at.reset();
      V.edit.x++;
      moveToEditPoint();
      V.ins.buf = '';
      V.ins.over = 0;
      V.ins.dest = V.edit.x;
      imodeMode();
      nmode = 'INSERT';
      break;

    default:
      assert.ok(false, 'unknown mode: ' + nmode);
  }

  V.mode = nmode;
}

function printStatus(status, reverse)
{
  at.reset();
  if (reverse)
    at.reverse();
  at.moveto(1, -1);
  at.eraseLine();
  at.write(status);
  if (reverse)
    at.reset();
}

function wc(buf)
{
  var l = buf.length;
  var c = 0;
  for (var i = 0; i < buf.length; i++) {
    c += buf[i].length;
  }
  return { l: l, c: c };
}

function printFileInfo()
{
  var cnt = wc(V.buf);
  printStatus('"' + V.path + '" ' + cnt.l + ' lines, ' + cnt.c + ' characters');
}

function openFile(path, creat)
{
  if (V.dirty) {
    printStatus('No write since last change.', true);
    return;
  }
  if (!fs.existsSync(path)) {
    if (creat) {
      V.path = path;
      V.buf = [''];
      printStatus('"' + V.path + '" [New file]');
    } else {
      printStatus('"' + path + '" No such file or directory', true);
    }
    return modeSwitch('EDIT');
  }
  V.path = path;
  V.buf = fs.readFileSync(path).toString('utf8').split('\n');
  if (V.buf.length > 0 && V.buf[V.buf.length - 1] === '')
    V.buf = V.buf.slice(0, V.buf.length - 1);
  redraw();
  printFileInfo();
  return modeSwitch('EDIT');
}

function execute(cmd)
{
  var x = cmd.match(/([0-9]*)(.*)/);
  if (x[1]) {
    var num = Number(x[1]);
    if (num === 0)
      num = 1;
    if (num > V.buf.length) {
      printStatus('Not that many lines in buffer', true);
      return false;
    }
    V.edit.y = num - 1;
  }
  cmd = x[2];
  var command = [];
  var force = false;
  switch (cmd) {
    case '':
      return true;
    case 'set nonu':
      command.push('NONU');
      break;
    case 'set nu':
      command.push('NU');
      break;
    case 'version':
      command.push('VERSION');
      break;
    default:
      for (var i = 0; i < cmd.length; i++) {
        var cc = cmd[i];
        switch (cmd[i]) {
          case 'w':
            command.push('WRITE');
            break;
          case 'q':
            command.push('QUIT');
            break;
          case '!':
            force = true;
            break;
          default:
            printStatus('Not an editor command: ' + cmd, true);
            return false;
        }
      }
  }
  for (var j = 0; j < command.length; j++) {
    switch (command[j]) {
      case 'NONU':
        V.set.linenumbers = false;
        redraw();
        break;
      case 'NU':
        V.set.linenumbers = true;
        redraw();
        break;
      case 'VERSION':
        printStatus('Version node-vi -- Joshua M. Clulow <josh@sysmgr.org>');
        break;
      case 'WRITE':
        if (V.path === null) {
          printStatus('No current filename', true);
          break;
        } else {
          try {
            fs.writeFileSync(V.path, V.buf.join('\n') + '\n', 'utf8');
            printFileInfo();
            V.dirty = false;
          } catch (ex) {
            printStatus('ERROR: ' + ex.message, true);
          }
        }
        break;
      case 'QUIT':
        if (V.dirty && !force) {
          printStatus('No write since last change (:quit! overrides)', true);
        } else {
          at.write('\n');
          process.exit(0);
        }
        break;
      default:
        assert.ok(false, 'unknown command ' + command[j]);
    }
  }
  return true;
}



var STR_printing = ' ?!:\\/_-@#$%^&*()+=.,`~<>[]{}|\'";';
var CC_printing = null;
function isprinting(cc)
{
  if (CC_printing === null) {
    CC_printing = [];
    for (var i = 0; i < STR_printing.length; i++) {
      CC_printing.push(STR_printing.charCodeAt(i));
    }
  }
  return isalphanum(cc) || CC_printing.indexOf(cc) !== -1;
}

function isalphanum(cc)
{
  return isalpha(cc) || isnum(cc);
}

var CC_A = 'A'.charCodeAt(0);
var CC_Z = 'Z'.charCodeAt(0);
var CC_a = 'a'.charCodeAt(0);
var CC_z = 'z'.charCodeAt(0);
function isalpha(cc)
{
  if (cc >= CC_A && cc <= CC_Z)
    return true;
  if (cc >= CC_a && cc <= CC_z)
    return true;
  return false
}

var CC_0 = '0'.charCodeAt(0);
var CC_9 = '9'.charCodeAt(0);
function isnum(cc)
{
  if (cc >= CC_0 && cc <= CC_9)
    return true;
  return false
}

at.on('CR', function() {
  if (V.mode === 'COMMAND') {
    execute(V.cmd.buf);
    V.cmd.hist.push(V.cmd.buf);
    V.cmd.buf = '';
    modeSwitch('EDIT');
  } else if (V.mode === 'INSERT') {
    splitLine();
    redraw();
    moveToEditPoint();
  } else if (V.mode === 'EDIT') {
    moveDown();
  }
});

function imodeMode()
{
  if (V.ins.over > V.ins.buf.length)
    at.replaceMode();
  else
    at.insertMode();
}

at.on('keypress', function(cc) {
  var ch = String.fromCharCode(cc);
  switch (V.mode) {
    case 'COMMAND':
      if (!isprinting(cc))
        return;
      V.cmd.buf += ch;
      at.write(ch);
      break;
    case 'INSERT':
      if (!isprinting(cc))
        return;
      V.ins.buf += ch;
      if (V.ins.buf.length > V.ins.over)
        V.ins.over++;
      V.edit.x++;
      at.write(ch);
      imodeMode();
      break;
    case 'EDIT':
      if (ch === ':') {
        return modeSwitch('COMMAND');
      } else if (ch === 'A') {
        V.edit.x = V.buf[V.edit.y].length - 1;
        return modeSwitch('APPEND');
      } else if (ch === 'a') {
        return modeSwitch('APPEND');
      } else if (ch === 'I') {
        V.edit.x = 0;
        return modeSwitch('INSERT');
      } else if (ch === 'i') {
        return modeSwitch('INSERT');
      } else if (ch === 'o') {
        var newarr = V.buf.slice(0, V.edit.y + 1);
        newarr.push('');
        newarr = newarr.concat(V.buf.slice(V.edit.y + 1, V.buf.length));
        V.buf = newarr;
        V.edit.y++;
        V.edit.memx = V.edit.x = 0;
        redraw();
        return modeSwitch('INSERT');
      }
      
      if (ch === 'x') {
        V.buf[V.edit.y] = removeString(V.buf[V.edit.y], V.edit.x, 1);
        if (V.edit.x >= V.buf[V.edit.y].length)
          V.edit.x = V.buf[V.edit.y].length - 1;
        if (V.edit.x < 0)
          V.edit.x = 0;
        redraw();
      } else if (ch === 'w') {
        if (V.edit.x < V.buf[V.edit.y].length)
          V.edit.x++;
        while (V.edit.x < V.buf[V.edit.y].length) {
          if ('?!.,:'.indexOf(V.buf[V.edit.y][V.edit.x]) !== -1)
            break;
          if (V.edit.x < V.buf[V.edit.y].length - 1 &&
              ' \t'.indexOf(V.buf[V.edit.y][V.edit.x - 1]) === -1)
            V.edit.x++;
          else
            break;
        }
      } else if (ch === 'b') {
        if (V.edit.x > 0)
          V.edit.x--;
        while (V.edit.x > 0) {
          if ('?!.,:'.indexOf(V.buf[V.edit.y][V.edit.x]) !== -1)
            break;
          if (V.edit.x >= 1 &&
              ' \t'.indexOf(V.buf[V.edit.y][V.edit.x - 1]) === -1)
            V.edit.x--;
          else
            break;
        }
      } else if (ch === 'G') {
        V.edit.y = V.buf.length - 1;
        V.edit.x = V.edit.memx;
        if (V.edit.x >= V.buf[V.edit.y].length)
          V.edit.x = V.buf[V.edit.y].length - 1;
      } else if (ch === '^') {
        V.edit.x = 0;
      } else if (ch === '$') {
        V.edit.x = V.buf[V.edit.y].length > 0 ? V.buf[V.edit.y].length - 1 : 0;
      }
      V.edit.memx = V.edit.x;
      moveToEditPoint();
  }
});

function insertString(oldstr, idx, newstr)
{
  return oldstr.slice(0, idx) + newstr + oldstr.slice(idx, oldstr.length);
}

function removeString(oldstr, idx, count)
{
  return oldstr.slice(0, idx) + oldstr.slice(idx + count, oldstr.length);
}

function delOrBs()
{
  switch (V.mode) {
    case 'COMMAND':
      if (V.cmd.buf.length <= 0)
        return modeSwitch('EDIT');
      V.cmd.buf = V.cmd.buf.slice(0, V.cmd.buf.length - 1);
      at.write('\b');
      break;
    case 'INSERT':
      if (V.ins.buf.length > 0) {
        V.ins.buf = V.ins.buf.slice(0, V.ins.buf.length - 1);
        V.edit.x--;
        at.write('\b');
      }
      imodeMode();
      break;
  }
}
at.on('DEL', delOrBs);
at.on('BS', delOrBs);

at.on('BEL', function(cc) {
  if (V.mode !== 'EDIT')
    return;
  var fn = null;
  var di = null;
  if (V.path === null) {
    fn = 'No file ';
    di = '';
  } else {
    fn = '"' + V.path + '"';
    di = V.dirty ? ' [Modified]' : '';
  }
  redraw();
  printStatus(fn + di + ' line ' + (V.edit.y + 1) + ' of ' + V.buf.length); //+
    //' --100%--');
  moveToEditPoint();
});

function splitLine()
{
  var oldstr = V.buf[V.edit.y];
  V.buf[V.edit.y] = oldstr.slice(0, V.ins.dest) + V.ins.buf;
  var newarr = V.buf.slice(0, V.edit.y + 1);
  newarr.push(oldstr.slice(V.ins.dest, oldstr.length));
  V.buf = newarr.concat(V.buf.slice(V.edit.y + 1, V.buf.length));
  V.ins.buf = '';
  V.ins.dest = 0;
  V.edit.x = 0;
  V.edit.y++;
}

at.on('ESC', function(cc) {
  if (V.mode === 'INSERT') {
    V.buf[V.edit.y] = insertString(V.buf[V.edit.y], V.ins.dest, V.ins.buf);
    redraw();
    return modeSwitch('EDIT');
  }
});

at.on('up', function() {
  if (V.mode === 'EDIT') {
    if (V.edit.y > 0) {
      V.edit.y--;
      V.edit.x = V.edit.memx;
      if (V.edit.x >= V.buf[V.edit.y].length)
        V.edit.x = V.buf[V.edit.y].length - 1;
      if (V.edit.x < 0)
        V.edit.x = 0;
      moveToEditPoint();
    }
  }
});
function moveDown()
{
  if (V.edit.y < V.buf.length - 1) {
    V.edit.y++;
    V.edit.x = V.edit.memx;
    if (V.edit.x >= V.buf[V.edit.y].length)
      V.edit.x = V.buf[V.edit.y].length - 1;
    if (V.edit.x < 0)
      V.edit.x = 0;
    moveToEditPoint();
  }
}
at.on('down', function() {
  if (V.mode === 'EDIT')
    moveDown();
});
at.on('left', function() {
  if (V.mode === 'EDIT') {
    if (V.edit.x > 0) {
      V.edit.x--;
      moveToEditPoint();
    }
  }
  V.edit.memx = V.edit.x;
});
at.on('right', function() {
  if (V.mode === 'EDIT') {
    if (V.edit.x < V.buf[V.edit.y].length - 1) {
      V.edit.x++;
      moveToEditPoint();
    }
  }
  V.edit.memx = V.edit.x;
});



redraw();

/* XXX require better argument parsing */
(function main()
{
  for (var i = 2; i < process.argv.length; i++) {
    var arg = process.argv[i];
    if (arg[0] === '-')
      continue;
    V.files.push(arg);
  }
  if (V.files.length > 0)
    openFile(V.files.shift(), true);
})();
