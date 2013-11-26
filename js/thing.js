JXG.Options.text.useMathJax = true;

//does each argument (of an operation) need brackets around it?
//arrays consisting of one object for each argument of the operation
var opBrackets = {
	'+u':[{}],
	'-u':[{'+':true,'-':true}],
	'+': [{},{}],
	'-': [{},{'+':true}],
	'*': [{'+u':true,'-u':true,'+':true, '-':true, '/':true},{'+u':true,'-u':true,'+':true, '-':true, '/':true}],
	'/': [{'+u':true,'-u':true,'+':true, '-':true, '*':true},{'+u':true,'-u':true,'+':true, '-':true, '*':true}],
	'^': [{'+u':true,'-u':true,'+':true, '-':true, '*':true, '/':true},{'+u':true,'-u':true,'+':true, '-':true, '*':true, '/':true}],
	'and': [{'or':true, 'xor':true},{'or':true, 'xor':true}],
	'or': [{'xor':true},{'xor':true}],
	'xor':[{},{}],
	'=': [{},{}]
};
var niceNumber = LissaJS.math.niceNumber;
function treeToJS(tree) {
	if(!tree)
		return '';

	var args = tree.args, l;

	var bits;
	if(args!==undefined && ((l=args.length)>0))
	{
		bits = args.map(function(subtree){return treeToJS(subtree);});
	}

	var tok = tree.tok;
	switch(tok.type) {
		case 'number':
			switch(tok.value) {
				case Math.E:
					return 'Math.E';
				case Math.PI:
					return 'Math.PI';
				default:
					return niceNumber(tok.value);
			}
			break;
		case 'name':
			return tok.name;
		case 'function':
			return 'LissaJS.math.'+tok.name+'('+bits.join(',')+')';
		case 'op':
		var op = tok.name;

		for(var i=0;i<l;i++)
		{
			if(args[i].tok.type=='op' && opBrackets[op][i][args[i].tok.name]===true)
			{
				bits[i]='('+bits[i]+')';
				args[i].bracketed=true;
			}
			else if(args[i].tok.type=='number' && args[i].tok.value.complex && (op=='*' || op=='-u' || op=='/'))
			{
				if(!(args[i].tok.value.re===0 || args[i].tok.value.im===0))
				{
					bits[i] = '('+bits[i]+')';
					args[i].bracketed = true;
				}
			}
		}

		switch(op) {
			case '-u':
				return '-'+bits[0];
			case '+u':
				return '+'+bits[1];
			case '^':
				return 'Math.pow('+bits[0]+','+bits[1]+')';
			default:
				if(l==1)
					{return op+bits[0];}
				else
					{return bits[0]+op+bits[1];}
		}
	}
}		




var viewModel;
$(document).ready(function() {

var board;
var P;
var vector_field;
var solution;

function VM() {
	this.expression = ko.observable('sin(x-y)');
	this.showVectorField = ko.observable(false);
	this.showSolution = ko.observable(false);

	this.jsexpression = ko.computed(function() {
		try {
			return treeToJS(LissaJS.jme.compile(this.expression()));
		}
		catch(e) {
			return '';
		}
	},this);

	ko.computed(function() {
		var expr = this.expression();
		if(expr == this.oexpr)
			return;
		this.oexpr = expr;
		var jme = LissaJS.jme;
		try {
		 	var tree = jme.compile(expr,jme.builtinScope);
			var js = treeToJS(tree);
			var grad = eval('(function(x,y){ return '+js+';})');
			this.changeGrad(grad,this);
		} catch(e) {}
	},this).extend({throttle:100});
	
	ko.computed(function() {
		if(!board)
			return;

		var show = this.showVectorField();
		for(var i=0;i<vector_field.length; i++) {
			if(show)
				vector_field[i].showElement();
			else
				vector_field[i].hideElement();
		}
	},this);

	ko.computed(function() {
		if(!solution)
			return;

		if(this.showSolution())
			solution.showElement();
		else
			solution.hideElement();
		solution.updateDataArray();
		board.update();
	},this);
}
VM.prototype = {
	changeGrad: function(grad,options) {
		var Px = Py = 0;
		if(P) {
			Px = P.X();
			Py = P.Y();
		}

		if(board)
			JXG.JSXGraph.freeBoard(board);

		board = JXG.JSXGraph.initBoard(
			'board',
			{
				boundingBox:[-5,5,5,-5],
				showCopyright:false, 
				showNavigation:false, 
				axis:true
			}
		);

		P = board.create('point',[Px,Py], {name:'$(x_0,y_0)$'});

		vector_field = [];
		var px = -5, py = 0;
		var showVectorField = this.showVectorField();
		//create new vector field lines
		function plotVector() {
			for(var i=0;i<10;i++) {
				var len = 1/4;
				var fxy = grad(px,py);
				var d = len/Math.pow(1+Math.pow(fxy,2),0.5);
				var seg = board.create('segment',[[px,py],[px+d,py+d*fxy]],{strokeWidth: 1, visible: showVectorField});
				vector_field.push(seg);

				px += 0.5;
				if(px>5) {
					px = -5;
					if(py<=0)
						py = -py + 0.5;
					else
						py = -py;
					if(py>5)
						return;
				}
			}
			setTimeout(plotVector,1);
		}
		plotVector();
		

		function get_grad(x,yy) {
			var y = yy[0];
			var z = grad(x,y);
			return [z];
		}

		var showSolution = this.showSolution();
		solution = board.create('curve', [[0],[0]], {strokeColor:'red', strokeWidth:2, visible: showSolution});

		solution.updateDataArray = function() {
			var x = P.X(), y = P.Y();

			var data_forward = JXG.Math.Numerics.rungeKutta('heun', [y], [x, 5], 200, get_grad);
			var data_backward = JXG.Math.Numerics.rungeKutta('heun', [y], [x, -5], 200, get_grad);

			var h = (5-x)/200;
			var h1 = (5+x)/200;

			this.dataX = [];
			this.dataY = [];

			var bl = data_backward.length;
			for(var i=0; i<bl; i++) {
				this.dataX[i] = -5+i*h1;
				this.dataY[i] = data_backward[bl-1-i][0];
			}

			for(var i=0; i<data_forward.length; i++) {
				var j = i + data_backward.length;
				this.dataX[j] = x+i*h;
				this.dataY[j] = data_forward[i][0];
			}
		};
		board.update();

		function getMouseCoords(e) {
			var i;
			if (e[JXG.touchProperty]) {
	            // index of the finger that is used to extract the coordinates
    	        i = 0;
        	}

			var cPos = board.getCoordsTopLeftCorner(e, i),
				absPos = JXG.getPosition(e, i),
				dx = absPos[0]-cPos[0],
				dy = absPos[1]-cPos[1];

			return new JXG.Coords(JXG.COORDS_BY_SCREEN, [dx, dy], board);
		}

		board.on('down',function(e) {
			var coords = getMouseCoords(e);
			P.setPosition(JXG.COORDS_BY_USER, [coords.usrCoords[1], coords.usrCoords[2]]);
		});
	}
};

viewModel = new VM();
ko.applyBindings(viewModel);

});
