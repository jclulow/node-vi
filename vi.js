#!/usr/bin/env node

var assert = require('assert');
var ANSITerm = require('../node-ansiterm/ansiterm').ANSITerm;


var at = new ANSITerm();

var V = {
  mode: 'EDIT',
  cmd: {
    buf: '',
    hist: []
  },
  edit: {
    x: 0,
    y: 0
  },
  buf: [''],
  dirty: false,
  ins: {
    buf: '',
    over: 0,
    dest: 0
  }
};

function redraw()
{
  at.clear();
  var sz = at.size();
  at.moveto(1, 1);
  var bufpos = -1;
  for (var y = 1; y < sz.h; y++) {
    at.moveto(1, y);
    if (++bufpos < V.buf.length)
      at.write(V.buf[bufpos]);
    else
      at.write('~');
  }
  at.moveto(V.edit.x + 1, V.edit.y + 1);
}

var DEBUG = true;
function modeSwitch(nmode)
{
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
      at.reset();
      at.replaceMode();
      at.moveto(V.edit.x + 1, V.edit.y + 1);

      if (DEBUG) {
        at.moveto(1, 5);
        at.reverse();
        at.write('edit buffer:');
        at.moveto(1, 6);
        at.reset();
        at.write(V.buf[V.edit.y]);
        at.moveto(V.edit.x + 1, V.edit.y + 1);
      }

      break;
    case 'INSERT':
      V.dirty = true;
      at.reset();
      at.moveto(V.edit.x + 1, V.edit.y + 1);
      V.ins.buf = '';
      V.ins.over = 0;
      V.ins.dest = V.edit.x;
      imodeMode();
      break;

    default:
      assert.ok(false, 'unknown mode: ' + nmode);
  }

  V.mode = nmode;
}

function printStatus(status)
{
  at.reset();
  at.moveto(1, -1);
  at.eraseLine();
  at.write(status);
}

function execute(cmd)
{
  var command = [];
  var force = false;
  switch (cmd[i]) {
    case '':
      return true;
    case 'version':
      command.push('VERSION');
      break;
    default:
      for (var i = 0; i < cmd.length; i++) {
        var cc = cmd[i];
        switch (cmd[i]) {
          /*
          case 'w':
            command.push('WRITE');
            break;*/
          case 'q':
            command.push('QUIT');
            break;
          case '!':
            force = true;
            break;
          default:
            printStatus('Not an editor command: ' + cmd);
            return false;
        }
      }
  }
  for (var j = 0; j < command.length; j++) {
    switch (command[j]) {
      case 'VERSION':
        printStatus('Version node-vi -- Joshua M. Clulow <josh@sysmgr.org>');
        break;
      case 'QUIT':
        if (V.dirty && !force) {
          printStatus('No write since last change.');
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




var STR_printing = ' ?!:\\/_-@#$%^&*()+=.';
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
      } else if (ch === 'i') {
        return modeSwitch('INSERT');
      } else if (ch === '^') {
        V.edit.x = 0;
        at.moveto(V.edit.x + 1, V.edit.y + 1);
      } else if (ch === '$') {
        V.edit.x = V.buf[V.edit.y].length > 0 ? V.buf[V.edit.y].length - 1 : 0;
        at.moveto(V.edit.x + 1, V.edit.y + 1);
      }
  }
});

function insertString(oldstr, idx, newstr)
{
  return oldstr.slice(0, idx) + newstr + oldstr.slice(idx, oldstr.length);
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
  if (V.mode === 'EDIT')
    printStatus('No file  line ' + (edity + 1) + ' of ' + buffer.length +
      ' --100%--');
  at.moveto(V.edit.x + 1, V.edit.y + 1);
});
at.on('ESC', function(cc) {
  if (V.mode === 'INSERT') {
    V.buf[V.edit.y] = insertString(V.buf[V.edit.y], V.ins.dest, V.ins.buf);
    redraw();
    at.moveto(-10, -2);
    at.write('E');
    return modeSwitch('EDIT');
  }
});

at.on('left', function() {
  if (V.mode === 'EDIT') {
    if (V.edit.x > 0) {
      V.edit.x--;
      at.moveto(V.edit.x + 1, V.edit.y + 1);
    }
  }
});
at.on('right', function() {
  if (V.mode === 'EDIT') {
    if (V.edit.x < V.buf[V.edit.y].length - 1) {
      V.edit.x++;
      at.moveto(V.edit.x + 1, V.edit.y + 1);
    }
  }
});



redraw();
