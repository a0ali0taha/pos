/*
jQuery UI Virtual Keyboard
Version 1.8.2

Author: Jeremy Satterfield
Modified: Rob Garrison (Mottie on github)
-----------------------------------------
Creative Commons Attribution-Share Alike 3.0 Unported License
http://creativecommons.org/licenses/by-sa/3.0/

Caret code from jquery.caret.1.02.js
Licensed under the MIT License:
http://www.opensource.org/licenses/mit-license.php
-----------------------------------------

An on-screen virtual keyboard embedded within the browser window which
will popup when a specified entry field is focused. The user can then
type and preview their input before Accepting or Canceling.

As a plugin to jQuery UI styling and theme will automatically
match that used by jQuery UI with the exception of the required
CSS listed below.

Requires:
	jQuery
	jQuery UI (position utility) & CSS

Usage:
	$('input[type=text], input[type=password], textarea')
		.keyboard({
			layout:"qwerty",
			customLayout:
				[["q w e r t y {bksp}","Q W E R T Y {bksp}"],
				["s a m p l e {shift}","S A M P L E {shift}"],
				["{accept} {space} {cancel}","{accept} {space} {cancel}"]]
		});

Options:
	layout
		[String] specify which keyboard layout to use
		qwerty - Standard QWERTY layout (Default)
		international - US international layout
		alpha  - Alphabetical layout
		dvorak - Dvorak Simplified layout
		num    - Numerical (ten-key) layout
		custom - Uses a custom layout as defined by the customLayout option

	customLayout
		[Array] Specify a custom layout
			An Array of arrays.
			Each internal array is a new keyboard row.
			Each internal array can contain one to four rows (default, shifted, alt and alt-shift... respectively).
			String elements (Lower case and Upper case, alt lower case and alt-upper case respectively).
			Each string element must have each character or key seperated by a space.
			In the list below where two special/"Action" keys are shown, both keys have the same action but different appearances.
			Special/"Action" keys include:
				{a}, {accept} - Updates element value and closes keyboard
				{alt},{altgr} - AltGr for International keyboard
				{b}, {bksp}   - Backspace
				{c}, {cancel} - Clears changes and closes keyboard
				{clear}       - Clear input window - used in num pad
				{combo}       - Toggle combo (diacritic) key
				{dec}         - Decimal for numeric entry, only allows one decimal (optional use in num pad)
				{e}, {enter}  - Return/New Line
				{s}, {shift}  - Shift/Capslock
				{sign}        - Change sign of numeric entry (positive or negative)
				{sp:#}        - Replace # with a numerical value, adds blank space, value of 1 ~ width of one key
				{space}       - Spacebar
				{t}, {tab}    - Tab

CSS:
	.ui-keyboard { padding: .3em; position: absolute; left: 0; top: 0; z-index: 16000; }
	.ui-keyboard div { font-size: 1.1em; }
	.ui-keyboard-button { height: 2em; width: 2em; margin: .1em; cursor: pointer; }
	.ui-keyboard-widekey { width: 4em; }
	.ui-keyboard-space { width: 15em; }
	.ui-keyboard-preview { text-align: left; margin-bottom: 3px; }
	.ui-keyboard-keyset { text-align: center; }
	.ui-keyboard-input { text-align: left; }
	.ui-keyboard-input.placeholder { color: #888; }
	.ui-keyboard-button.ui-keyboard-combo.ui-state-default { border-color: #ffaf0f; }
	.ui-keyboard-overlay { height: 100%; width: 100%; background: transparent; position: absolute; top: 0; left: 0; z-index: 15999; }
	.ui-keyboard-overlay-input { position: relative; top: 0; left: 0; zoom: 1; z-index: 16000; }
*/


(function($){
$.keyboard = function(el, options){
	var base = this;

	// Access to jQuery and DOM versions of element
	base.$el = $(el);
	base.el = el;

	// Add a reverse reference to the DOM object
	base.$el.data("keyboard", base);

	base.init = function(){
		base.options = $.extend(true, {}, $.keyboard.defaultOptions, options);

		// Shift and Alt key toggles, sets is true if a layout has more than one keyset - used for mousewheel message
		base.shiftActive = base.altActive = base.metaActive = base.sets = false;
		// Class names of the basic key set - meta keysets are handled by the keyname
		base.rows = ['ui-keyboard-keyset-default', 'ui-keyboard-keyset-shift', 'ui-keyboard-keyset-alt', 'ui-keyboard-keyset-alt-shift' ];
		base.acceptedKeys = [];
		base.mappedKeys = {}; // for remapping manually typed in keys
		base.msie = $.browser.msie; // IE flag, used for caret positioning
		base.opera = $.browser.opera; // opera flag, also for caret positioning
		base.inPlaceholder = base.$el.attr('placeholder') || '';
		base.watermark = (typeof(document.createElement('input').placeholder) !== 'undefined' && base.inPlaceholder !== ''); // html 5 placeholder/watermark
		base.regex = $.keyboard.comboRegex; // save default regex (in case loading another layout changes it)
		base.decimal = ( /^\./.test(base.options.display.dec) ) ? true : false; // determine if US "." or European "," system being used

		base.checkCaret = (base.options.lockInput || base.msie || base.opera ) ? true : false; // needed to save caret positions when the input is locked.

		// Bind events
		$.each('visible change hidden canceled accepted beforeClose'.split(' '), function(i,o){
			if ($.isFunction(base.options[o])){
				base.$el.bind(o + '.keyboard', base.options[o]);
			}
		});

		// Close with esc key & clicking outside
		if (!base.options.stayOpen){
			$(document).bind('mousedown.keyboard keyup.keyboard', function(e){
				if (base.isVisible && ( e.type === 'mousedown' || (e.type === 'keyup' && e.which === 27) )){
					base.escClose(e);
				}
			});
		}

		// Display keyboard on focus
		base.$el
			.addClass('ui-keyboard-input ui-widget-content ui-corner-all')
			.attr({ 'aria-haspopup' : 'true', 'role' : 'textbox' });
		if (base.options.openOn) {
			base.$el.bind(base.options.openOn + '.keyboard', function(){
				base.focusOn();
			});
		}

		// Add placeholder if not supported by the browser
		if (!base.watermark && base.$el.val() === '' && base.$el.attr('placeholder') !== '') {
			base.$el
				.addClass('placeholder') // css watermark style (darker text)
				.val( base.inPlaceholder );
		}

	};

	base.focusOn = function(){
		if (!base.isVisible) {
			base.reveal();
			if (!base.options.usePreview) { setTimeout(function(){ base.preview.focus(); }, 100); } // needed for Opera
		}
	};

	base.reveal = function(){
		// close all keyboards
		$('.ui-keyboard').hide();

		// Unbind focus to prevent recursion
		if (!base.options.usePreview) { base.$el.unbind( (base.options.openOn) ? base.options.openOn + '.keyboard' : ''); }

		// build keyboard if it doesn't exist
		if (typeof(base.$keyboard) === 'undefined') { base.startup(); }

		// clear watermark 
		if (!base.watermark && base.el.value === base.inPlaceholder) {
			base.$el
				.removeClass('placeholder')
				.val('');
		}
		// save starting content, in case we cancel
		base.originalContent = base.$el.val();
		base.$preview.val( base.originalContent );

		// get single target position || target stored in element data (multiple targets) || default, at the element
		var o, s, position = base.options.position;
		position.of = position.of || base.$el.data('keyboardPosition') || base.$el;
		position.collision = (base.options.usePreview) ? position.collision || 'fit fit' : 'flip flip';

		// show & position keyboard
		base.$keyboard
			// position and show the keyboard before positioning (required for UI position utility)
			.css({ position: 'absolute', left: 0, top: 0 })
			.show()
			.position(position);

		// adjust keyboard preview window width - save width so IE won't keep expanding (fix issue #6)
		if (base.options.usePreview) {
                    // SCOTTIE NOTE: "width - 50" ensures larger keyboard stays on screen
                    base.$preview.css('width', base.$keyboard.width() - 50); // set preview width to fill keyboard IE7 thinks 100% means across the screen
		}
		base.preview.focus();
		base.isVisible = true;

		base.checkDecimal();

		// get preview area line height
		// add roughly 4px to get line height from font height, works well for font-sizes from 14-36px.
		base.lineHeight = parseInt( base.$preview.css('lineHeight'), 10) || parseInt(base.$preview.css('font-size') ,10) + 4;

		// IE & Opera caret haxx0rs
		if (base.msie || base.opera){
			// ensure caret is at the end of the text (needed for IE)
			s = base.originalContent.length;
			o = { start: s, end: s };
			if (!base.lastCaret) { base.lastCaret = o; } // set caret at end of content, if undefined
			if (base.lastCaret.end === 0 && base.lastCaret.start > 0) { base.lastCaret.end = base.lastCaret.start; } // sometimes end = 0 while start is > 0
			if (base.lastCaret.start < 0) { base.lastCaret = o; } // IE will have start -1, end of 0 when not focused (see demo: http://jsfiddle.net/Mottie/fgryQ/3/).
			base.$preview.caret( base.lastCaret.start, base.lastCaret.end );

			// Add overlay under the keyboard to prevent clicking in and not opening a new keyboard while one is open
			$('<div class="ui-keyboard-overlay"></div>')
				.click(function(){
					$(this).remove();
					base.close();
					return false;
				})
				.appendTo('body');
			if (!base.options.usePreview) { base.$el.addClass('ui-keyboard-overlay-input'); }
		}
		base.$el.trigger( 'visible.keyboard', base.$el );
		return base;
	};

	base.startup = function(){
		base.$keyboard = base.buildKeyboard();
		base.$allKeys = base.$keyboard.find('.ui-keyboard-button');
		base.$preview = (base.options.usePreview) ? base.$keyboard.find('.ui-keyboard-preview') : base.$el;
		base.preview = base.$preview[0];
		base.$decBtn = base.$keyboard.find('.ui-keyboard-dec');
		base.wheel = $.isFunction( $.fn.mousewheel ); // is mousewheel plugin loaded?
		base.alwaysAllowed = [33,34,35,36,37,38,39,40,45,46]; // keyCode of keys always allowed to be typed - page up & down, end, home, arrow, insert & delete keys
		base.$preview
			.bind('keypress.keyboard', function(e){
				var k = String.fromCharCode(e.charCode || e.which);
				if (base.checkCaret) { base.lastCaret = base.$preview.caret(); }

				// restrict input - keyCode in keypress special keys: see http://www.asquare.net/javascript/tests/KeyCode.html
				if (base.options.restrictInput) {
					// allow navigation keys to work - Chrome doesn't fire a keypress event
					if ( (e.which === 8 || e.which === 0) && $.inArray( e.keyCode, base.alwaysAllowed ) ) { return; }
					if (base.acceptedKeysStr.indexOf(k) === -1) { e.preventDefault(); } // quick key check
				} else if ( (e.ctrlKey || e.metaKey) && (e.which === 97 || e.which === 99 || e.which === 118 || e.which === 120) ) {
					// Allow select all (ctrl-a:97), copy (ctrl-c:99), paste (ctrl-v:118) & cut (ctrl-x:120); meta key for mac
					return;
				}
				// Mapped Keys - allows typing on a regular keyboard and the mapped key is entered
				// Set up a key in the layout as follows: "m(a):label"; m = key to map, (a) = actual keyboard key to map to (optional), ":label" = title/tooltip (optional)
				// example: \u0391 or \u0391(A) or \u0391:alpha or \u0391(A):alpha
				if (base.hasMappedKeys) {
					if (base.mappedKeys.hasOwnProperty(k)){
						base.insertText( base.mappedKeys[k] );
						e.preventDefault();
					}
				}
				base.checkMaxLength();
			})
			.bind('keyup.keyboard', function(e){
				switch (e.which) {
					// Insert tab key
					case 9 :
						// Added a flag to prevent from tabbing into an input, keyboard opening, then adding the tab to the keyboard preview
						// area on keyup. Sadly it still happens if you don't release the tab key immediately because keydown event auto-repeats
						if (base.tab) {
							$.keyboard.keyaction.tab(base);
							base.tab = false;
						}
						break;

					// Escape will hide the keyboard
					case 27:
						base.close();
						e.preventDefault();
						break;
				}

				// throttle the check combo function because fast typers will have an incorrectly positioned caret
				clearTimeout(base.throttled);
				base.throttled = setTimeout(function(){
					base.checkCombos();
				}, 100);

				base.checkMaxLength();
				base.$el.trigger( 'change.keyboard', [ base.$el, e ] );
			})
			.bind('keydown.keyboard', function(e){
				switch (e.which) {
					// prevent tab key from leaving the preview window
					case 9 :
						base.tab = true; // see keyup comment above
						e.preventDefault(); // Opera ignores this =(
						break;

					case 13:
						// Accept content - shift-enter
						//if (e.shiftKey) {
							base.close(true);
							e.preventDefault();
						//}
						break;

					case 86:
						// prevent ctrl-v/cmd-v
						if (e.ctrlKey || e.metaKey) {
							if (base.options.preventPaste) { e.preventDefault(); return; }
							base.checkCombos(); // check pasted content
						}
						break;
				}
			})
			.bind('mouseup.keyboard', function(){
				if (base.checkCaret) { base.lastCaret = base.$preview.caret(); }
			});

		// If preventing paste, block context menu (right click)
		if (base.options.preventPaste){
			base.$preview.bind('contextmenu.keyboard', function(e){ e.preventDefault(); });
			base.$el.bind('contextmenu.keyboard', function(e){ e.preventDefault(); });
		}

		base.$keyboard.appendTo('body');

		base.$allKeys
			.bind(base.options.keyBinding + '.keyboard', function(e){
				// 'key', { action: doAction, original: n, curTxt : n, curNum: 0 }
				var txt, key = $.data(this, 'key'), action = key.action.split(':')[0];
				base.preview.focus();
				// Start caret in IE when not focused (happens with each virtual keyboard button click
				if (base.checkCaret) { base.$preview.caret( base.lastCaret.start, base.lastCaret.end ); }
				if (action.match('meta')) { action = 'meta'; }
				if ($.keyboard.keyaction.hasOwnProperty(action) && $(this).is('.ui-keyboard-actionkey')) {
					// stop processing if action returns false (close & cancel)
					if ($.keyboard.keyaction[action](base,this) === false) { return; }
				} else if (typeof key.action !== 'undefined') {
					txt = (base.wheel && !$(this).is('.ui-keyboard-actionkey')) ? key.curTxt : key.action;
					base.insertText(txt);
				}
				base.checkCombos();
				base.checkMaxLength();
				base.$el.trigger( 'change.keyboard', [ base.$el, e ] );
				if (base.options.usePreview) { base.preview.focus(); }
				e.preventDefault();
			})
			// Change hover class and tooltip
			.bind('mouseenter.keyboard mouseleave.keyboard', function(e){
				var el = this, $this = $(this),
					// 'key' = { action: doAction, original: n, curTxt : n, curNum: 0 }
					key = $.data(el, 'key');
				if (e.type === 'mouseenter' && base.el.type !== 'password' ){
					$this
						.addClass('ui-state-hover')
						.attr('title', function(i,t){
							// show mouse wheel message
							return (base.wheel && t === '' && base.sets) ? base.options.wheelMessage : t;
						});
				}
				if (e.type === 'mouseleave'){
					key.curTxt = key.original;
					key.curNum = 0;
					$.data(el, 'key', key);
					$this
						.removeClass( (base.el.type === 'password') ? '' : 'ui-state-hover') // needed or IE flickers really bad
						.attr('title', function(i,t){ return (t === base.options.wheelMessage) ? '' : t; })
						.val( key.original ); // restore original button text
				}
			})
			// Allow mousewheel to scroll through other key sets of the same key
			.bind('mousewheel.keyboard', function(e, delta){
				if (base.wheel) {
					var txt, $this = $(this), key = $.data(this, 'key');
					txt = key.layers || base.getLayers( $this );
					key.curNum += (delta > 0) ? -1 : 1;
					if (key.curNum > txt.length-1) { key.curNum = 0; }
					if (key.curNum < 0) { key.curNum = txt.length-1; }
					key.layers = txt;
					key.curTxt = txt[key.curNum];
					$.data(this, 'key', key);
					$this.val( txt[key.curNum] );
					return false;
				}
			})
			.bind('mouseup.keyboard', function(e){
				base.preview.focus();
			});

	};

	// Insert text at caret/selection - thanks to Derek Wickwire for fixing this up!
	base.insertText = function(txt){
		var bksp, t,
			// use base.$preview.val() instead of base.preview.value (val.length includes carriage returns in IE).
			val = base.$preview.val(),
			pos = base.$preview.caret(),
			len = val.length; // save original content length

		// silly caret hacks (IE & Opera)... it should work correctly, but navigating using arrow keys in a textarea is still difficult
		if (pos.end < pos.start) { pos.end = pos.start; } // in IE, pos.end can be zero after input loses focus
		if (pos.start > len) { pos.end = pos.start = len; }
		// This makes sure the caret moves to the next line after clicking on enter (manual typing works fine)
		if (base.msie && val.substr(pos.start, 1) === '\n') { pos.start += 1; pos.end += 1; }
		// Opera still needs to subtract out the carriage returns
		if ( (base.msie || base.opera) && val.substr(0,pos.start).split('\n').length - 1 > 0) {
			t = val.substr(0,pos.start).split('\n').length - 1;
			pos.start += t;
			pos.end += t;
		}

		// Set scroll top so current text is in view - needed for virtual keyboard typing, not manual typing
		// this doesn't appear to work correctly in Opera
		base.preview.scrollTop = base.lineHeight * (val.split('\n').length - 1);

		bksp = (txt === 'bksp' && pos.start === pos.end) ? true : false;
		txt = (txt === 'bksp') ? '' : txt;
		t = pos.start + (bksp ? -1 : txt.length);
		base.$preview.val( val.substr(0, pos.start - (bksp ? 1 : 0)) + txt + val.substr(pos.end) );
		base.$preview.caret(t, t);

		if (base.checkCaret) { base.lastCaret = { start: t, end: t }; } // save caret in case of bksp
	};

	// check max length
	base.checkMaxLength = function(){
		var t, p = base.$preview.val();
		if (base.options.maxLength !== false && p.length > base.options.maxLength) {
			t = Math.min(base.$preview.caret().start, base.options.maxLength); 
			base.$preview.val( p.substring(0, base.options.maxLength) );
			// restore caret on change, otherwise it ends up at the end.
			base.$preview.caret( t, t );
			base.lastCaret = { start: t, end: t };
		}
		if (base.$decBtn.length) {
			base.checkDecimal();
		}
	};

	base.showKeySet = function(el){
		var key, toShow;
		base.$keyboard.find('.ui-keyboard-actionkey[name*=key_meta]').removeClass(base.options.actionClass);
		if (base.metaActive) {
			key = el.name.split('_')[1];
			if (!base.$keyboard.find('.ui-keyboard-keyset-' + key ).length) { return; } // keyset doesn't exist
			base.$keyboard
				.find('.ui-keyboard-alt, .ui-keyboard-shift, .ui-keyboard-actionkey[class*=meta]').removeClass(base.options.actionClass).end()
				.find('.ui-keyboard-actionkey.ui-keyboard-' + key).addClass(base.options.actionClass).end()
				.find('.ui-keyboard-keyset').hide().end()
				.find('.ui-keyboard-keyset-' + key ).show();
		} else {
			toShow = (base.shiftActive) ? 1 : 0;
			toShow += (base.altActive) ? 2 : 0;
			if (!base.$keyboard.find('.' + base.rows[toShow]).length) { return; } // keyset doesn't exist
			base.$keyboard
				.find('.ui-keyboard-alt')[(base.altActive) ? 'addClass' : 'removeClass'](base.options.actionClass).end()
				.find('.ui-keyboard-shift')[(base.shiftActive) ? 'addClass' : 'removeClass'](base.options.actionClass).end()
				.find('.ui-keyboard-keyset').hide().end()
				.find('.' + base.rows[toShow]).show();
		}
	};

	// check for key combos (dead keys)
	base.checkCombos = function(){
		var i, r, t,
			// use base.$preview.val() instead of base.preview.value (val.length includes carriage returns in IE).
			val = base.$preview.val(),
			pos = base.$preview.caret(),
			len = val.length; // save original content length

		// silly caret hacks (IE & Opera)... it should work correctly, but navigating using arrow keys in a textarea is still difficult
		if (pos.end < pos.start) { pos.end = pos.start; } // in IE, pos.end can be zero after input loses focus
		if (pos.start > len) { pos.end = pos.start = len; }
		// This makes sure the caret moves to the next line after clicking on enter (manual typing works fine)
		if (base.msie && val.substr(pos.start, 1) === '\n') { pos.start += 1; pos.end += 1; }
		// Opera still needs to subtract out the carriage returns
		if ( (base.msie || base.opera) && val.substr(0,pos.start).split('\n').length - 1 > 0) {
			t = val.substr(0,pos.start).split('\n').length - 1;
			pos.start += t;
			pos.end += t;
		}

		if (base.options.useCombos) {
			// keep 'a' and 'o' in the regex for ae and oe ligature (æ,œ)
			// thanks to KennyTM: http://stackoverflow.com/questions/4275077/replace-characters-to-make-international-letters-diacritics
			// original regex /([`\'~\^\"ao])([a-z])/mig moved to $.keyboard.comboRegex
			val = val.replace(base.regex, function(s, accent, letter){
				return (base.options.combos.hasOwnProperty(accent)) ? base.options.combos[accent][letter] || s : s;
			});
		}

		// check input restrictions - in case content was pasted
		if (base.options.restrictInput) {
			t = val.split('');
			r = t.length;
			for (i=0; i < r; i++){
				if ($.inArray( t[i], base.acceptedKeys ) < 0) { val = val.replace(t[i], ''); }
			}
		}

		// save changes, then reposition caret
		pos.start += val.length - len;
		pos.end += val.length - len;
		base.$preview.val(val);

		base.$preview.caret(pos.start, pos.end);

		// calculate current cursor scroll location and set scrolltop to keep it in view
		base.preview.scrollTop = base.lineHeight * (val.substring(0, pos.start).split('\n').length - 1); // find row, multiply by font-size

		base.lastCaret = { start: pos.start, end: pos.end };
		return val; // return text, used for keyboard closing section
	};

	// Decimal button for num pad - only allow one (not used by default)
	base.checkDecimal = function(){
		// Check US "." or European "," format
		if ( ( base.decimal && /\./g.test(base.preview.value) ) || ( !base.decimal && /\,/g.test(base.preview.value) ) ) {
			base.$decBtn
				.attr({ 'disabled': 'disabled', 'aria-disabled': 'true' })
				.removeClass('ui-state-default ui-state-hover')
				.addClass('ui-state-disabled');
		} else {
			base.$decBtn
				.removeAttr('disabled')
				.attr({ 'aria-disabled': 'false' })
				.addClass('ui-state-default')
				.removeClass('ui-state-disabled');
		}
	};

	// get other layer values for a specific key
	base.getLayers = function(el){
		var key, keys;
		key = el.attr('name');
		keys = el.closest('.ui-keyboard').find('input[name=' + key + ']').map(function(){
			return this.value;
		}).get();
		return keys;
	};

	// Close the keyboard, if visible. Pass a status of true, if the content was accepted (for the event trigger).
	base.close = function(accepted){
		if (base.$keyboard.is(':visible')) {
			clearTimeout(base.throttled);
			base.$el
				.trigger('beforeClose.keyboard', [ base.$el, (accepted || false) ] )
				.val( (accepted) ? base.checkCombos() : base.originalContent )
				.scrollTop( base.el.scrollHeight )
				.trigger( (accepted || false) ? 'accepted.keyboard' : 'canceled.keyboard', base.$el )
				.trigger( 'hidden.keyboard', base.$el )
				.removeClass('ui-keyboard-overlay-input') // added for IE overlay
				.blur();
			if (!base.options.usePreview && base.options.openOn !== '') {
				// rebind input focus
				base.$el.blur().bind( base.options.openOn + '.keyboard', function(){ base.focusOn(); });
			}
			base.$keyboard.hide();
			$('.ui-keyboard-overlay').remove(); // IE overlay
			base.isVisible = false;
			if (!base.watermark && base.el.value === '') {
				base.$el
					.addClass('placeholder')
					.val(base.inPlaceholder);
			}
		}
	};

	base.accept = function(){
		base.close(true);
	};

	base.escClose = function(e){
		// necessary to prevent keyboard closing when usePreview is false
		if ( e.target === base.el ) { return; }
		if ( !$(e.target).closest('.ui-keyboard').length ) {
			base.close( (base.options.autoAccept) ? true : false );
		}
		// stop propogation in IE - an input getting focus doesn't open a keyboard if one is already open
		if (base.msie) { e.preventDefault(); }
	};

	// Build default button
	base.keyBtn = $('<input />')
		.attr({ 'type': 'button', 'role': 'button', 'aria-disabled': 'false' })
		.addClass('ui-keyboard-button ui-state-default ui-corner-all');

	// Add key function
	// keyName = name added to key, name = display option name (e.g. tab or t),
	// doAction = what is done/added when the button is clicked, regKey = true when it is not an action key
	base.addKey = function(keyName, name, regKey ){
		var t, keyType, m, map, nm, tbtn,
			n = (regKey === true) ? keyName : base.options.display[name] || keyName;
		// map defined keys - format "key(A):Label_for_key"
		// "key" = key that is seen (can any character; but it might need to be escaped using "\" or entered as unicode "\u####"
		// "(A)" = the actual key on the real keyboard to remap, ":Label_for_key" ends up in the title/tooltip
		if (/\(.+\)/.test(n)) { // n = "\u0391(A):alpha"
			map = n.replace(/\(([^()]+)\)/, ''); // remove "(A)", left with "\u0391:alpha"
			m = n.match(/\(([^()]+)\)/)[1]; // extract "A" from "(A)"
			n = map;
			nm = map.split(':');
			map = (nm[0] !== '' && nm.length > 1) ? nm[0] : map; // get "\u0391" from "\u0391:alpha"
			base.mappedKeys[m] = map;
		}

		// find key label
		nm = n.split(':');

		if (nm[0] === '' && nm[1] === '') { n = ':'; } // corner case of ":(:):;" reduced to "::;", split as ["", "", ";"]
		n = (nm[0] !== '' && nm.length > 1) ? $.trim(nm[0]) : n;
		t = (nm.length > 1) ? $.trim(nm[1]).replace(/_/g, " ") || '' : ''; // added to title

		// Action keys will have the 'ui-keyboard-actionkey' class
		// '\u2190'.length = 1 because the unicode is converted, so if more than one character, add the wide class
		keyType = (n.length > 1) ? ' ui-keyboard-widekey' : '';
		keyType += (regKey !== true) ? ' ui-keyboard-actionkey' : '';
		tbtn = base.keyBtn
			.clone()
			.attr({ 'name': 'key_' + keyName, 'title' : t })
			.data('key', { action: keyName, original: n, curTxt : n, curNum: 0 })
			.val( n )
			// add "ui-keyboard-" + keyName, if this is an action key (e.g. "Bksp" will have 'ui-keyboard-bskp' class)
			// add "ui-keyboard-" + unicode of 1st character (e.g. "~" is a regular key, class = 'ui-keyboard-126' (126 is the unicode value - same as typing &#126;)
			.addClass('ui-keyboard-' + ((regKey === true) ? keyName.charCodeAt(0) : keyName) + keyType );
    // SCOTTIE: Add special class for larger buttons only on numpad keyboard
    if (base.options.layout === 'num') {
      tbtn.addClass('ui-keyboard-button-num');
    }
    return tbtn;
	};

	base.buildKeyboard = function(){
		var action, row, newRow, newSet,
			currentSet, key, keys, margin,
			sets = 0,

		container = $('<div />')
			.addClass('ui-keyboard ui-widget-content ui-widget ui-corner-all ui-helper-clearfix')
			.attr({ 'role': 'textbox' })
			.hide();

		// build preview display
		if (base.options.usePreview) {
			base.$preview = base.$el.clone(false)
				.removeAttr('id')
				.removeAttr('placeholder')
				.removeClass('placeholder')
				.addClass('ui-widget-content ui-keyboard-preview ui-corner-all')
				.show(); // for hidden inputs
        // SCOTTIE: For larger numpad display box
        if (base.options.layout === 'num') {
          base.$preview.addClass('ui-keyboard-preview-num');
        }
		} else {
			// No preview display, use element and reposition the keyboard under it.
			base.$preview = base.$el;
			base.options.position.at = base.options.position.at2;
		}
		base.$preview.attr( (base.options.lockInput) ? { 'readonly': 'readonly'} : {} );

		// build preview container and append preview display
		if (base.options.usePreview) {
			$('<div />')
				.append(base.$preview)
				.appendTo(container);
		}

		// verify layout or setup custom keyboard
		if (base.options.layout === 'custom' || !$.keyboard.layouts.hasOwnProperty(base.options.layout)) {
			base.options.layout = 'custom';
			$.keyboard.layouts.custom = base.options.customLayout || { 'default' : ['{cancel}'] };
		}

		// Main keyboard building loop
		$.each($.keyboard.layouts[base.options.layout], function(set, keySet){
			if (set !== "") {
				sets++;
				newSet = $('<div />')
					.attr('name', set) // added for typing extension
					.addClass('ui-keyboard-keyset ui-keyboard-keyset-' + set)
					.appendTo(container)[(set === 'default') ? 'show' : 'hide']();

				for ( row = 0; row < keySet.length; row++ ){
					newRow = $('<div />')
						.addClass('ui-keyboard-row ui-keyboard-row' + row )
						.appendTo(newSet);

					// remove extra spaces before spliting (regex probably could be improved)
					currentSet = $.trim(keySet[row]).replace(/\{(\.?)[\s+]?:[\s+]?(\.?)\}/g,'{$1:$2}');
					keys = currentSet.split(/\s+/);

					for ( key = 0; key < keys.length; key++ ) {
						// ignore empty keys
						if (keys[key].length === 0) { continue; }

						// process here if it's an action key
						if( /^\{\S+\}$/.test(keys[key])){
							action = keys[key].match(/^\{(\S+)\}$/)[1].toLowerCase();

							// add empty space
							if (/^sp:(\.?\d+)$/.test(action)) {
								margin = action.match(/^sp:(\.?\d+)$/)[1] || 0;
								$('<span>&nbsp;</span>')
									.css('margin','0 ' + margin + 'em')
									.appendTo(newRow);
							}

							// meta keys
							if (/^meta\d+\:?(\w+)?/.test(action)){
								base.addKey(action, action).appendTo(newRow);
								continue;
							}

							// switch needed for action keys with multiple names/shortcuts or
							// default will catch all others
							switch(action){

								case 'a':
								case 'accept':
									base.addKey('accept', action)
									.addClass(base.options.actionClass)
									.appendTo(newRow);
									break;

								case 'alt':
								case 'altgr':
									base.addKey('alt', 'alt').appendTo(newRow);
									break;

								case 'b':
								case 'bksp':
									base.addKey('bksp', action).appendTo(newRow);
									break;

								case 'c':
								case 'cancel':
									base.addKey('cancel', action)
									.addClass(base.options.actionClass)
									.appendTo(newRow);
									break;

								// toggle combo/diacritic key
								case 'combo':
									base.addKey('combo', 'combo')
									.addClass(base.options.actionClass)
									.appendTo(newRow);
									break;

								// Decimal - unique decimal point (num pad layout)
								case 'dec':
									base.acceptedKeys.push((base.decimal) ? '.' : ',');
									base.addKey('dec', 'dec').appendTo(newRow);
									break;

								case 'e':
								case 'enter':
									base.addKey('enter', action)
									.addClass(base.options.actionClass).appendTo(newRow);
									break;

								case 's':
								case 'shift':
									base.addKey('shift', action).appendTo(newRow);
									break;

								// Change sign (for num pad layout)
								case 'sign':
									base.acceptedKeys.push('-');
									base.addKey('sign', 'sign').appendTo(newRow);
									break;

								case 'space':
									base.acceptedKeys.push(' ');
									base.addKey('space', 'space').appendTo(newRow);
									break;

								case 't':
								case 'tab':
									base.addKey('tab', action).appendTo(newRow);
									break;

								default:
									if ($.keyboard.keyaction.hasOwnProperty(action)){
										// base.acceptedKeys.push(action);
										base.addKey(action, action).appendTo(newRow);
									}

							}

						} else {

							// regular button (not an action key)
							base.acceptedKeys.push(keys[key].split(':')[0]);
							base.addKey(keys[key], keys[key], true)
								.attr('name','key_' + row + '_'+key)
								.appendTo(newRow);

						}
					}
				}
			}
		});
	
		if (sets > 1) { base.sets = true; }
		base.acceptedKeysStr = base.acceptedKeys.join('');
		base.hasMappedKeys = !( $.isEmptyObject(base.mappedKeys) ); // $.isEmptyObject() requires jQuery 1.4+
		return container;
	};

	base.destroy = function() {
		$(document).unbind('mousedown.keyboard keyup.keyboard', base.escClose );
		if (base.$keyboard) { base.$keyboard.remove(); }
		base.$el
			.removeClass('ui-keyboard-input ui-widget-content ui-corner-all placeholder')
			.removeAttr('aria-haspopup')
			.removeAttr('role')
			.unbind( base.options.openOn + '.keyboard accepted.keyboard canceled.keyboard beforeClose.keyboard hidden.keyboard visible.keyboard keydown.keyboard keypress.keyboard keyup.keyboard contextmenu.keyboard')
			.removeData('keyboard');
	};

		// Run initializer
		base.init();
	};

	// Action key function list
	$.keyboard.keyaction = {
		accept : function(base){
			base.close(true); // same as base.accept();
			return false;     // return false prevents further processing
		},
		alt : function(base,el){
			base.altActive = !base.altActive;
			base.metaActive = false;
			base.showKeySet(el);
		},
		bksp : function(base){
			base.insertText('bksp'); // the script looks for the "bksp" string and initiates a backspace
		},
		cancel : function(base){
			base.close();
			return false; // return false prevents further processing
		},
		clear : function(base){
			base.$preview.val('');
		},
		combo : function(base){
			var c = !base.options.useCombos;
			base.options.useCombos = c;
			base.$keyboard.find('.ui-keyboard-combo')[(c) ? 'addClass' : 'removeClass'](base.options.actionClass);
			if (c) { base.checkCombos(); }
			return false;
		},
		dec : function(base){
			base.insertText((base.decimal) ? '.' : ',');
		},
		enter : function(base) {
			if (base.el.tagName === 'INPUT') { return; } // ignore enter key in input
			base.insertText('\r\n');
		},
		meta : function(base,el){
			base.metaActive = ($(el).is('.' + base.options.actionClass)) ? false : true;
			base.showKeySet(el);
		},
		shift : function(base,el){
			base.shiftActive = !base.shiftActive;
			base.metaActive = false;
			base.showKeySet(el);
		},
		sign : function(base){
			if(/^\-?\d*\.?\d*$/.test( base.$preview.val() )) {
				base.$preview.val( (base.$preview.val() * -1) );
			}
		},
		space : function(base){
			base.insertText(' ');
		},
		tab : function(base) {
			if (base.el.tagName === 'INPUT') { return; } // ignore tab key in input
			base.insertText('\t');
		}
	};

	// Default keyboard layouts
	$.keyboard.layouts = {
		'alpha' : {
			'default': [
				'` 1 2 3 4 5 6 7 8 9 0 - = {bksp}',
				'{tab} a b c d e f g h i j [ ] \\',
				'k l m n o p q r s ; \' {enter}',
				'{shift} t u v w x y z , . / {shift}',
				'{accept} {space} {cancel}'
			],
			'shift': [
				'~ ! @ # $ % ^ & * ( ) _ + {bksp}',
				'{tab} A B C D E F G H I J { } |',
				'K L M N O P Q R S : " {enter}',
				'{shift} T U V W X Y Z < > ? {shift}',
				'{accept} {space} {cancel}'
			]
		},
		'qwerty' : {
			'default': [
				'` 1 2 3 4 5 6 7 8 9 0 - = {bksp}',
				'{tab} q w e r t y u i o p [ ] \\',
				'a s d f g h j k l ; \' {enter}',
				'{shift} z x c v b n m , . / {shift}',
				'{accept} {space} {cancel}'
			],
			'shift': [
				'~ ! @ # $ % ^ & * ( ) _ + {bksp}',
				'{tab} Q W E R T Y U I O P { } |',
				'A S D F G H J K L : " {enter}',
				'{shift} Z X C V B N M < > ? {shift}',
				'{accept} {space} {cancel}'
			]
		},
		'international' : {
			'default': [
				'` 1 2 3 4 5 6 7 8 9 0 - = {bksp}',
				'{tab} q w e r t y u i o p [ ] \\',
				'a s d f g h j k l ; \' {enter}',
				'{shift} z x c v b n m , . / {shift}',
				'{accept} {alt} {space} {alt} {cancel}'
			],
			'shift': [
				'~ ! @ # $ % ^ & * ( ) _ + {bksp}',
				'{tab} Q W E R T Y U I O P { } |',
				'A S D F G H J K L : " {enter}',
				'{shift} Z X C V B N M < > ? {shift}',
				'{accept} {alt} {space} {alt} {cancel}'
			],
			'alt': [
				'~ \u00a1 \u00b2 \u00b3 \u00a4 \u20ac \u00bc \u00bd \u00be \u2018 \u2019 \u00a5 \u00d7 {bksp}',
				'{tab} \u00e4 \u00e5 \u00e9 \u00ae \u00fe \u00fc \u00fa \u00ed \u00f3 \u00f6 \u00ab \u00bb \u00ac',
				'\u00e1 \u00df \u00f0 f g h j k \u00f8 \u00b6 \u00b4 {enter}',
				'{shift} \u00e6 x \u00a9 v b \u00f1 \u00b5 \u00e7 > \u00bf {shift}',
				'{accept} {alt} {space} {alt} {cancel}'
			],
			'alt-shift': [
				'~ \u00b9 \u00b2 \u00b3 \u00a3 \u20ac \u00bc \u00bd \u00be \u2018 \u2019 \u00a5 \u00f7 {bksp}',
				'{tab} \u00c4 \u00c5 \u00c9 \u00ae \u00de \u00dc \u00da \u00cd \u00d3 \u00d6 \u00ab \u00bb \u00a6',
				'\u00c4 \u00a7 \u00d0 F G H J K \u00d8 \u00b0 \u00a8 {enter}',
				'{shift} \u00c6 X \u00a2 V B \u00d1 \u00b5 \u00c7 . \u00bf {shift}',
				'{accept} {alt} {space} {alt} {cancel}'
			]
		},
		'dvorak' : {
			'default': [
				'` 1 2 3 4 5 6 7 8 9 0 [ ] {bksp}',
				'{tab} \' , . p y f g c r l / = \\',
				'a o e u i d h t n s - {enter}',
				'{shift} ; q j k x b m w v z {shift}',
				'{accept} {space} {cancel}'
			],
			'shift' : [
				'~ ! @ # $ % ^ & * ( ) { } {bksp}',
				'{tab} " < > P Y F G C R L ? + |', 
				'A O E U I D H T N S _ {enter}',
				'{shift} : Q J K X B M W V Z {shift}',
				'{accept} {space} {cancel}'
			]
		},
		'num' : {
			'default' : [
				'= ( ) {b}',
				'{clear} / * -',
				'7 8 9 +',
				'4 5 6 {sign}',
				'1 2 3 %',
				'0 . {a} {c}'
			]
		}
	};

	$.keyboard.defaultOptions = {

		// *** choose layout & positioning ***
		layout       : 'qwerty',
		customLayout : null,

		position     : {
			of : null, // optional - null (attach to input/textarea) or a jQuery object (attach elsewhere)
			my : 'center top',
			at : 'center top',
			at2: 'center bottom' // used when "usePreview" is false (centers the keyboard at the bottom of the input/textarea)
		},

		// preview added above keyboard if true, original input/textarea used if false
		usePreview   : true,

		// if true, keyboard will remain open even if the input loses focus.
		stayOpen     : false,

		// *** change keyboard language & look ***
		display : {
			'a'      : '\u2714:Accept (Shift-Enter)', // check mark - same action as accept
			'accept' : 'Accept:Accept (Shift-Enter)',
			'alt'    : 'AltGr:Alternate Graphemes',
			'b'      : '\u2190:Backspace',    // Left arrow (same as &larr;)
			'bksp'   : 'Bksp:Backspace',
			'c'      : '\u2716:Cancel (Esc)', // big X, close - same action as cancel
			'cancel' : 'Cancel:Cancel (Esc)',
			'clear'  : 'C:Clear',             // clear num pad
			'combo'  : '\u00f6:Toggle Combo Keys',
			'dec'    : '.:Decimal',           // decimal point for num pad (optional), change '.' to ',' for European format
			'e'      : '\u21b5:Enter',        // down, then left arrow - enter symbol
			'enter'  : 'Enter:Enter',
			's'      : '\u21e7:Shift',        // thick hollow up arrow
			'shift'  : 'Shift:Shift',
			'sign'   : '\u00b1:Change Sign',  // +/- sign for num pad
			'space'  : ' :Space',
			't'      : '\u21e5:Tab',          // right arrow to bar (used since this virtual keyboard works with one directional tabs)
			'tab'    : '\u21e5 Tab:Tab'       // \u21b9 is the true tab symbol (left & right arrows)
		},

		// Message added to the key title while hovering, if the mousewheel plugin exists
		wheelMessage : 'Use mousewheel to see other keys',

		// Class added to the Accept and cancel buttons (originally 'ui-state-highlight')
		actionClass  : 'ui-state-active',

		// *** Useability ***
		// Auto-accept content when clicking outside the keyboard (popup will close)
		autoAccept   : false,

		// Prevents direct input in the preview window when true
		lockInput    : false,

		// Prevent keys not in the displayed keyboard from being typed in
		restrictInput: false,

		// Prevent pasting content into the area
		preventPaste : false,

		// Set the max number of characters allowed in the input, setting it to false disables this option
		maxLength    : false,

		// Event (namespaced) on the input to reveal the keyboard. To disable it, just set it to ''.
		openOn       : 'focus',

		// Event (namepaced) for when the character is added to the input (clicking on the keyboard)
		keyBinding   : 'mousedown',

		// combos (emulate dead keys : http://en.wikipedia.org/wiki/Keyboard_layout#US-International)
		// if user inputs `a the script converts it to à, ^o becomes ô, etc.
		useCombos : true,
		combos    : {
			'`' : { a:"\u00e0", A:"\u00c0", e:"\u00e8", E:"\u00c8", i:"\u00ec", I:"\u00cc", o:"\u00f2", O:"\u00d2", u:"\u00f9", U:"\u00d9", y:"\u1ef3", Y:"\u1ef2" }, // grave
			"'" : { a:"\u00e1", A:"\u00c1", e:"\u00e9", E:"\u00c9", i:"\u00ed", I:"\u00cd", o:"\u00f3", O:"\u00d3", u:"\u00fa", U:"\u00da", y:"\u00fd", Y:"\u00dd", c:"\u00e7", C:"\u00c7" }, // acute & cedilla
			'"' : { a:"\u00e4", A:"\u00c4", e:"\u00eb", E:"\u00cb", i:"\u00ef", I:"\u00cf", o:"\u00f6", O:"\u00d6", u:"\u00fc", U:"\u00dc", y:"\u00ff", Y:"\u0178" }, // umlaut/trema
			'^' : { a:"\u00e2", A:"\u00c2", e:"\u00ea", E:"\u00ca", i:"\u00ee", I:"\u00ce", o:"\u00f4", O:"\u00d4", u:"\u00fb", U:"\u00db", y:"\u0177", Y:"\u0176" }, // circumflex
			'~' : { a:"\u00e3", A:"\u00c3", e:"\u1ebd", E:"\u1ebc", i:"\u0129", I:"\u0128", o:"\u00f5", O:"\u00d5", u:"\u0169", U:"\u0168", y:"\u1ef9", Y:"\u1ef8", n:"\u00f1", N:"\u00d1" }, // tilde
			'a' : { e:"\u00e6" }, // ae ligature
			'A' : { E:"\u00c6" },
			'o' : { e:"\u0153" }, // oe ligature
			'O' : { E:"\u0152" }
		},

		// *** Methods ***
		// Callbacks - attach a function to any of these callbacks as desired
		accepted : null,
		canceled : null,
		hidden   : null,
		visible  : null,
		beforeClose: null

	};

	// for checking combos
	$.keyboard.comboRegex = /([`\'~\^\"ao])([a-z])/mig;

	$.fn.keyboard = function(options){
		return this.each(function(){
			(new $.keyboard(this, options));
		});
	};

	$.fn.getkeyboard = function(){
		return this.data("keyboard");
	};

})(jQuery);

/*
 *
 * Copyright (c) 2010 C. F., Wong (<a href="http://cloudgen.w0ng.hk">Cloudgen Examplet Store</a>)
 * Licensed under the MIT License:
 * http://www.opensource.org/licenses/mit-license.php
 *
 */
(function($, len, createRange, duplicate){
$.fn.caret = function(options,opt2) {
	var s, start, e, end, selRange, range, stored_range, te, val,
		selection = document.selection, t = this[0], sTop = t.scrollTop, browser = $.browser.msie;
	if (typeof t === 'undefined') { return; }
	if (typeof options === "number" && typeof opt2 === "number") {
		start = options;
		end = opt2;
	}
	if (typeof start !== "undefined") {
		if (browser){
			selRange = t.createTextRange();
			selRange.collapse(true);
			selRange.moveStart('character', start);
			selRange.moveEnd('character', end-start);
			selRange.select();
		} else {
			t.selectionStart=start;
			t.selectionEnd=end;
		}
		t.focus();
		t.scrollTop = sTop;
		return this;
	} else {
		if (browser) {
			if (t.tagName.toLowerCase() !== "textarea") {
				val = this.val();
				range = selection[createRange]()[duplicate]();
				range.moveEnd("character", val[len]);
				s = (range.text === "" ? val[len] : val.lastIndexOf(range.text));
				range = selection[createRange]()[duplicate]();
				range.moveStart("character", -val[len]);
				e = range.text[len];
			} else {
				range = selection[createRange]();
				stored_range = range[duplicate]();
				stored_range.moveToElementText(t);
				stored_range.setEndPoint('EndToEnd', range);
				s = stored_range.text[len] - range.text[len];
				e = s + range.text[len];
			}
		} else {
			s = t.selectionStart;
			e = t.selectionEnd;
		}
		te = t.value.substring(s,e);
		return { start : s, end : e, text : te, replace : function(st){
			return t.value.substring(0,s) + st + t.value.substring(e, t.value[len]);
		}};
	}
};
})(jQuery, "length", "createRange", "duplicate");
