var socketInstances = {};
var activeSessions = [];
var boardDatas = {};

function handleNewBoard(ipAddress) {
	if(ipAddress === undefined) {
		ipAddress = prompt('Please enter the board\'s IP address.');
	}
	let socket = io.connect(ipAddress, { reconnection: false });
	socket.on('connect', () => {
		socketInstances[socket.id] = socket;
		activeSessions.push(socket.id);
		socket.emit('ioRequest', '');

		socket.on('gpioData', (data) => {
			boardDatas[socket.id] = data;
			
			let html = `
			<div class="module" role="main" data-socket-id="${socket.id}">
			<div class="module-head">
				<h1><span>${data.boardName}</span></h1>
			</div>
			<div class="module-buttons">
				<a href="javascript:;" title="Add a New GPIO Pin" class="board-action new-pin-btn" onclick="addIO('${socket.id}')"><i class="fas fa-plus-square"></i></a>
				<a href="javascript:;" title="Rename The Board" class="board-action rename-board-btn" onclick="renameBoard('${socket.id}')"><i class="far fa-edit"></i></a>
				<a href="javascript:;" title="Link an Input To A Relay" id="linkToInput" class="board-action link-input-btn" onclick="linkToInput('${socket.id}')"><i class="fas fa-link"></i></a>
				<a href="javascript:;" title="Unlink a Pin" id="unlinkPin" class="unlink-pin-btn" onclick="unlinkPin('${socket.id}')"><i class="fas fa-unlink"></i></a>
				<a href="javascript:;" title="Remove The Board" id="removeBoard" class="module-remove-btn" onclick="removeBoard('${socket.id}')"><i class="fas fa-minus-circle"></i></a>
				<a href="javascript:;" title="Set a Relay as Bistable" id="setBistable" class="set-bistable-btn" onclick="setBistable('${socket.id}')">Bi</a>
				<a href="javascript:;" title="Set a Relay as Monostable" id="setMonostable" class="set-monostable-btn" onclick="setMonostable('${socket.id}')">Mono</a>
			</div>
			<div class="module-body">
				<div class="module io-module">
					<div class="module-head">
						<h3>Outputs</h3>
					</div>
					<div class="module-body">
						<ul class="ios outputs">
						${data.pinOrder.map((item, i) => `
						${(data.controllable_pins[item] == '1' || data.controllable_pins[item] == '2') ? `
						<li data-gpio-number="${item}" data-socket-id="${socket.id}" data-gpio-state="${data.pinStates[item]}">
							<a href="javascript:;" class="io-edit" onclick="editIO('${item}', '${socket.id}');"><i class="far fa-edit"></i></a>
							<a href="javascript:;" class="io-control" onclick="controlIO('${item}', '${socket.id}');">${data.pinNames[item]}</a>
							<a href="javascript:;" class="io-remove" onclick="removeIO('${item}', '${socket.id}');"><i class="fas fa-minus-circle"></i></a>
						</li>
						` : ''}
						`.trim()).join('')}
						</ul>
					</div>
				</div>
				<div class="module io-module">
					<div class="module-head">
						<h3>Inputs</h3>
					</div>
					<div class="module-body">
						<ul class="ios inputs">  
						${data.pinOrder.map((item, i) => `
						${data.controllable_pins[item] == '0' ? `
						<li data-gpio-number="${item}" data-socket-id="${socket.id}" data-gpio-state="${data.pinStates[item]}">
							<a href="javascript:;" class="io-edit" onclick="editIO('${item}', '${socket.id}');"><i class="far fa-edit"></i></a>
							<a href="javascript:;" class="io-control">${data.pinNames[item]}</a>
							<a href="javascript:;" class="io-remove" onclick="removeIO('${item}', '${socket.id}');"><i class="fas fa-minus-circle"></i></a>
						</li>
						` : ''}
						`.trim()).join('')}                    
						</ul>
					</div>
				</div>
			</div>
		</div>
				`;
			$('main#page-content').append(html);
		});

	});
}

function controlIO(pin, socketId) {
	if(Object.values(boardDatas[socketId].links).includes(pin)) {
		console.log('This pin is linked and cannot be changed!');
	} else {
		let socketInstance = socketInstances[socketId];
		let currentValue = $(`li[data-socket-id="${socketId}"][data-gpio-number="${pin}"]`).attr('data-gpio-state');
		let changeTo = currentValue == '1' ? 0 : '1';
		socketInstance.emit('stateChangeRequest', {'pin': pin, 'state': changeTo});
		$(`li[data-socket-id="${socketId}"][data-gpio-number="${pin}"]`).attr('data-gpio-state', 'unknown');
		getChangedState();
	}
}

function setBistable(socketId) {
	let pin = prompt('Please enter the pin number you want to change to bistable mode.');
	if($.isNumeric(pin) && pin in boardDatas[socketId].controllable_pins) {
		let socketInstance = socketInstances[socketId];
		socketInstance.emit('bistableRequest', {'pin': pin});
	}else{
		alert('There is an error with your input.');
		return false;
	}
}

function linkToInput(socketId) {
	let input = prompt('Please enter the input pin.');
	let output = prompt('Please enter the output pin.');
	if(input in boardDatas[socketId].controllable_pins && output in boardDatas[socketId].controllable_pins && boardDatas[socketId].controllable_pins[input] == '0' && boardDatas[socketId].controllable_pins[output] != '0') {
		let socketInstance = socketInstances[socketId];
		socketInstance.emit('linkToInput', {'input': input, 'output': output});
	}else{
		alert('There is an error with your inputs.');
		return false;
	}
}

function unlinkPin(socketId) {
	let pin = prompt("Please enter the pin to unlink.");
	if(pin in boardDatas[socketId].controllable_pins && (pin in boardDatas[socketId].links || Object.values(boardDatas[socketId].links).includes(pin))) {
		let socketInstance = socketInstances[socketId];
		socketInstance.emit('unlinkPin', {'pin': pin});
	} else {
		alert('There is an error with your input.');
		return false;
	}
}

function setMonostable(socketId) {
	let pin = prompt('Please enter the pin number you want to change to monostable mode.');
	let timeout = prompt('Please enter the timeout for monostable mode in milliseconds.');
	if($.isNumeric(pin) && pin in boardDatas[socketId].controllable_pins && $.isNumeric(timeout)) {
		let socketInstance = socketInstances[socketId];
		socketInstance.emit('monostableRequest', {'pin': pin, 'timeout': timeout});
	}else{
		alert('There is an error with your inputs.');
		return false;
	}
}

function addIO(socketId) {
	let pin = prompt('Please enter the pin number you want to add.');
	let dir = prompt('Please specify the pin direction(in or out).');
	if($.isNumeric(pin) && (dir == 'in' || dir == 'out')) {
		let socketInstance = socketInstances[socketId];
		dir = dir == 'out' ? '1' : '0';
		socketInstance.emit('newPinRequest', {'pin': pin, 'direction': dir});
	}else{
		alert('There is an error with your inputs.');
		return false;
	}
}

function removeIO(pin, socketId) {
	let confirmation = confirm('Are you sure you want to delete this pin?');
	if(confirmation) {
		let socketInstance = socketInstances[socketId];
		socketInstance.emit('removePinRequest', {'pin': pin});
		$(`li[data-socket-id=${socketId}][data-gpio-number=${pin}]`).attr('data-gpio-state', 'unknown');
	}
}

function editIO(pin, socketId) {
	let name = prompt('Please enter the new name of pin.');
	if(name && name != '' && name.length > 0) {
		let socketInstance = socketInstances[socketId];
		socketInstance.emit('renamePinRequest', {'pin': pin, 'name': name});
	}else{
		alert('There is an error with your input.');
		return false;
	}

}

function renameBoard(socketId) {
	let name = prompt('Please enter the new name of the board.');
	if(name && name != '' && name.length > 0) {
		let socketInstance = socketInstances[socketId];
		socketInstance.emit('renameBoardRequest', {'name': name});
	}else{
		alert('There is an error with your input.');
		return false;
	}

}

function getNewPin() {
	for(let [socketId, socketInstance] of Object.entries(socketInstances)) {
		socketInstance.on('pinHasAdded', (data) => {
			let pin = data.pin;
			let dir = data.direction;
			let name = data.name;
			if($.isNumeric(pin) && (dir == '1' || dir == '0') && name != '' & name != 'undefined') {
				let ifExists = $(`li[data-gpio-number=${pin}][data-socket-id=${socketId}]`).length;
				if(!ifExists) {
					boardDatas[socketId].controllable_pins[pin] = dir;
					$(`.module[data-socket-id=${socketId}] ul.ios.${dir == '1' ? 'outputs' : 'inputs'}`).append(`
						<li data-gpio-number="${pin}" data-gpio-state="unknown" data-socket-id="${socketId}">
							<a class="io-edit" href="javascript:;" onclick="editIO('${pin}', '${socketId}')"><i class="far fa-edit"></i></a>
							<a class="io-control" href="javascript:;" ${dir == '1' ? `onclick="controlIO('${pin}', '${socketId}')"` : ''}>${name}</a>
							<a class="io-remove" href="javascript:;" onclick="removeIO('${pin}', '${socketId}')"><i class="fas fa-minus-circle"></i></a>
						</li>
					`);
				}
			}else {
				console.log('Pin duplication has been avoided.');
			}
		});
	}
}

function getChangedState() {
	for(let [socketId, socketInstance] of Object.entries(socketInstances)) {
		socketInstance.on('stateHasChanged', (data) => {
			let pin = data.pin;
			let state = data.state;
			boardDatas[socketId].pinStates[pin] = state;
			$(`li[data-socket-id=${socketId}][data-gpio-number=${pin}]`).attr('data-gpio-state', state);
		});
	}
}

function getRemovedPin() {
	for(let [socketId, socketInstance] of Object.entries(socketInstances)) {
		socketInstance.on('pinHasRemoved', (data) => {
			let pin = data.pin;
			let element = $(`li[data-socket-id=${socketId}][data-gpio-number=${pin}]`);
			let isAvailable = element.length;
			delete boardDatas[socketId].controllable_pins[pin];
			delete boardDatas[socketId].pinStates[pin];
			delete boardDatas[socketId].pinNames[pin];
			delete boardDatas[socketId].links[pin];
			for(var i in boardDatas[socketId].links) { if(i == pin) { delete boardDatas[socketId.links[i]]; } }
			let index = boardDatas[socketId].pinOrder.indexOf(pin);
			boardDatas[socketId].pinOrder.splice(index, 1);
			if(isAvailable) {
				element.remove();
			}else{
				console.log('Unavailable element to remove.');
			}
		});
	}
}

function getRenamedPin() {
	for(let [socketId, socketInstance] of Object.entries(socketInstances)) {
		socketInstance.on('pinHasRenamed', (data) => {
			let pin = data.pin;
			let name = data.name;
			let rename = $(`li[data-socket-id=${socketId}][data-gpio-number=${pin}] a.io-control`).html(name);
			boardDatas[socketId].pinNames[pin] = name;
			if(!rename) {
				console.log('Renaming error on pin ' + pin);
			}
		});
	}
}

function handleAutomaticAddition() {
	let changeTo = '';
	if(localStorage.getItem('onbootboards') === null) {
		changeTo = prompt('Please enter addresses of the boards to load on pageload(Split multiple with comma(,))');
	}else{
		changeTo = prompt('Please enter addresses of the boards to load on pageload(Split multiple with comma(,))', localStorage.getItem('onbootboards'));
	}
	localStorage.setItem('onbootboards', changeTo == null ? '' : changeTo);
}

function getRenamedBoard() {
	for(let [socketId, socketInstance] of Object.entries(socketInstances)) {
		socketInstance.on('boardHasRenamed', (data) => {
			let name = data.name;
			let rename = $(`.module[data-socket-id=${socketId}] .module-head h1 span`).html(name);
			boardDatas[socketId].boardName = name;
			if(!rename) {
				console.log('Renaming error on board.');
			}
		});
	}
}

function getLinkedPin() {
        for(let [socketId, socketInstance] of Object.entries(socketInstances)) {
                socketInstance.on('pinHasBeenLinked', (data) => {
                        let input = data.input;
			let output = data.output;
                        boardDatas[socketId].links[input] = output;
                });
        }
}

function getUnlinkedPin() {
        for(let [socketId, socketInstance] of Object.entries(socketInstances)) {
                socketInstance.on('pinHasBeenUnlinked', (data) => {
                        let input = data.input;
                        delete boardDatas[socketId].links[input];
                });
        }
}

function checkBoardConnection() {
	for(let [socketId, socketInstance] of Object.entries(socketInstances)) {
		if(!(socketInstance.connected)) {
			console.log('Dsc: ' + socketInstance.connected);
			$(`li[data-socket-id=${socketId}]`).attr('data-gpio-state', 'unknown');
			$(`li[data-socket-id=${socketId}] a`).removeAttr('onclick');
			$(`.module[data-socket-id=${socketId}] > .module-head h1 span`).append('<span class="inactiveBoard">(Board is inactive!)</span>');
			$(`.module[data-socket-id=${socketId}] .board-action`).removeAttr('onclick');
			delete socketInstances[socketId];
			delete activeSessions[socketId];
			delete boardDatas[socketId];
		}
	}
}

function addBoardsOnLoad() {
	let hostnames = localStorage.getItem('onbootboards');
	if(hostnames != '') {
		try {
			let hostArray = hostnames.split(',');
			hostArray.forEach(item => {
				handleNewBoard(item);
			});
		} catch(e) {
			console.log('No automatic addition boards found');
		}
	}
}

function removeBoard(socketId) {
	let confirmation = confirm('Are you sure you want to delete the board?');
	if(confirmation) {
		$(`.module[data-socket-id=${socketId}]`).remove();
		let socketInstance = socketInstances[socketId];
		socketInstance.close();
		delete socketInstances[socketId];
		delete boardDatas[socketId];
	}
}

$(() => {

	handleNewBoard('');
	addBoardsOnLoad();
	setInterval(getRenamedBoard, 3000);
	setInterval(getChangedState, 1500);
	setInterval(getNewPin, 2000);
	setInterval(getRemovedPin, 2500);
	setInterval(getRenamedPin, 3000);
	setInterval(checkBoardConnection, 4000);
	setInterval(getLinkedPin, 4000);
	setInterval(getUnlinkedPin, 4000);

});
