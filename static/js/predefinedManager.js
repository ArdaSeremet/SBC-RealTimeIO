var socketInstances = {};
var activeSessions = [];
var boardDatas = {};
var predefinedList = [1, 2, 3, 4, 5, 6, 7, 8];

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
						<h3>Predefined Pins [ Not RealTime ]</h3>
					</div>
					<div class="module-body">
						<ul class="ios outputs">
						${predefinedList.map((item, i) => `
						${
							`<li><span>Number ${item}: </span><select data-number="${item}" data-socket-id="${socket.id}">
							<option ${(!(Object.keys(data.predefined).includes(item.toString()))) ? 'selected' : ''} value="unset">Unset Predefined</option>
							${data.pinOrder.map((pin) => `
							${data.controllable_pins[pin] != '0' ? `
							<option ${((item.toString() in data.predefined) && data.predefined[item.toString()] == pin.toString()) ? 'selected' : ''} value="${pin}">${data.pinNames[pin]} - Pin ${pin}</option>
							` : ''}
							`.trim()).join('')}
							</select></li>`
						}
						`.trim()).join('')}
						</ul>
					</div>
				</div>
			</div>
		</div>
				`;
			$('main#page-content').append(html);

			predefinedList.forEach(item => {
				let selectElement = $("select[data-number='"+item+"'][data-socket-id='"+socket.id+"']");
				selectElement.on('change', e => {
					let value = selectElement.children('option:selected').attr('value');
					if(value == 'unset') {
						unsetPredefined(item, socket.id);
					} else {
						setPredefined(item, value, socket.id);
					}
				});
			});
		});

	});
}

function setPredefined(number, pin, socketId) {
	if(pin in boardDatas[socketId].controllable_pins && (number in predefinedList)) {
		socketInstances[socketId].emit('predefinedRequest', {'number': number, 'pin': pin});
	}
}

function unsetPredefined(number, socketId) {
	if(number in predefinedList) {
		socketInstances[socketId].emit('unpredefinedRequest', {'number': number});
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

$(() => {

	handleNewBoard('');
	addBoardsOnLoad();
	setInterval(checkBoardConnection, 4000);
	setInterval(getRenamedBoard, 4000);

});