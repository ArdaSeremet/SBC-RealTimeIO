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
				<a href="javascript:;" title="Rename The Board" class="board-action rename-board-btn" onclick="renameBoard('${socket.id}')"><i class="far fa-edit"></i></a>
				<a href="javascript:;" title="Remove The Board" id="removeBoard" class="module-remove-btn" onclick="removeBoard('${socket.id}')"><i class="fas fa-minus-circle"></i></a>
			</div>
			<div class="module-body">
				<div class="module io-module">
					<div class="module-head">
						<h3>Outputs[Warning: Output settings are not updated in realtime.]</h3>
					</div>
					<div class="module-body">
						<ul class="ios outputs">
						${data.pinOrder.map((item, i) => `
						${(data.controllable_pins[item] == '1' || data.controllable_pins[item] == '2') ? `
						<li data-gpio-number="${item}" data-socket-id="${socket.id}">
							<span>${data.pinNames[item]}</span>
							<input type="number" min="0" data-socket-id="${socket.id}" data-gpio-number="${item}" name="timeout" value="${(item in data.timeouts) ? data.timeouts[item] : '0'}" />
							<select data-gpio-number="${item}" data-socket-id="${socket.id}">
								<option data-mode="${(data.controllable_pins[item] == '2') ? 'monostable' : 'bistable'}" data-gpio-number="${item}" selected>${(data.controllable_pins[item] == '2') ? 'Monostable(Timer Mode)' : 'Bistable(ON-OFF Mode)'}</option>
								<option data-mode="${(data.controllable_pins[item] == '2') ? 'bistable' : 'monostable'}" data-gpio-number="${item}">${(data.controllable_pins[item] == '2') ? 'Bistable(ON-OFF Mode)' : 'Monostable(Timer Mode)'}</option>
							</select>
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
						<li data-gpio-number="${item}" data-socket-id="${socket.id}">
						<span>${data.pinNames[item]}</span>
						<select data-gpio-number="${item}" data-socket-id="${socket.id}">
							<option data-link-to="unlink" ${(!(item in data.links)) ? 'selected' : ''} data-gpio-number="${item}">Independent Pin</option>
							${data.pinOrder.map((_item, _i) => `

							${(data.controllable_pins[_item] != '0') ? `

							<option data-link-to="${_item}" data-gpio-number="${item}" ${(item in data.links) ? (data.links[item] == _item) ? 'selected' : '' : ''}>Linked to '${data.pinNames[_item]}'</option>					

							`: ''}					

							`.trim()).join('')}
						</select>						</li>
						` : ''}
						`.trim()).join('')}                    
						</ul>
					</div>
				</div>
			</div>
		</div>
				`;
			$('main#page-content').append(html);
			for(let [pin, mode] of Object.entries(data.controllable_pins)) {
				if(mode != '0') {
					let selectElement = $("select[data-gpio-number='"+pin+"'][data-socket-id='"+socket.id+"']");
					selectElement.on('change', (e) => {
						changeMode(pin, selectElement.children('option:selected').attr('data-mode'), socket.id);
					});
				} else {
					let selectElement = $("select[data-gpio-number='"+pin+"'][data-socket-id='"+socket.id+"']");
					selectElement.on('change', (e) => {
						let input = selectElement.children('option:selected').attr('data-gpio-number');
						let output = selectElement.children('option:selected').attr('data-link-to');
						if(data.controllable_pins[input] == '0') {
							if(output == 'unlink') {
								unlinkPin(socket.id, input);
							} else if(output in data.controllable_pins && data.controllable_pins[output] != '0') {
								linkToInput(socket.id, input, output);
							}
						}
					});
				}
			
			}
		});

	});
}
function changeMode(pin, mode, socketId) {
	if(pin in boardDatas[socketId].controllable_pins && (mode == 'bistable' || mode == 'monostable')) {
		let modeCode = (mode == 'bistable') ? '1' : '2';
		let timeout = $("input[data-gpio-number="+pin+"][data-socket-id="+socketId+"]").val();
		if(modeCode == '1') {
			socketInstances[socketId].emit('bistableRequest', {'pin': pin});
		} else {
			socketInstances[socketId].emit('monostableRequest', {'pin': pin, 'timeout': timeout});
		}
	}
}

function linkToInput(socketId, input, output) {
	if(input === undefined || output === undefined) {
		input = prompt('Please enter the input pin.');
		output = prompt('Please enter the output pin.');	
	}
	console.log("here");
	if(input in boardDatas[socketId].controllable_pins && output in boardDatas[socketId].controllable_pins && boardDatas[socketId].controllable_pins[input] == '0' && boardDatas[socketId].controllable_pins[output] != '0') {
		let socketInstance = socketInstances[socketId];
		socketInstance.emit('linkToInput', {'input': input, 'output': output});
	}else{
		alert('There is an error with your inputs.');
		return false;
	}
}

function unlinkPin(socketId, pin) {
	if(pin === undefined) {
		pin = prompt("Please enter the pin to unlink.");
	}
	if(pin in boardDatas[socketId].controllable_pins && (pin in boardDatas[socketId].links || Object.values(boardDatas[socketId].links).includes(pin))) {
		let socketInstance = socketInstances[socketId];
		socketInstance.emit('unlinkPin', {'pin': pin});
	} else {
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

function getRenamedPin() {
	for(let [socketId, socketInstance] of Object.entries(socketInstances)) {
		socketInstance.on('pinHasRenamed', (data) => {
			console.log('h');
			let pin = data.pin;
			let name = data.name;
			let rename = $(`li[data-socket-id=${socketId}][data-gpio-number=${pin}] span`).html(name);
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
						let selectElement = $(`select[data-gpio-number='${input}'][data-socket-id='${socketId}']`);
						selectElement.children('option:selected').removeAttr('selected');
						selectElement.children('option[data-link-to='+output+']').attr('selected', 'selected');
                        boardDatas[socketId].links[input] = output;
                });
        }
}

function getUnlinkedPin() {
        for(let [socketId, socketInstance] of Object.entries(socketInstances)) {
                socketInstance.on('pinHasBeenUnlinked', (data) => {
                        let input = data.input;
                        let selectElement = $(`select[data-gpio-number='${input}'][data-socket-id='${socketId}']`);
                        selectElement.children('option:selected').removeAttr('selected');
                        selectElement.children('option[data-link-to=unlink]').attr('selected', 'selected')
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
	setInterval(getRenamedPin, 3000);
	setInterval(checkBoardConnection, 4000);
	setInterval(getLinkedPin, 4000);
	setInterval(getUnlinkedPin, 4000);

});