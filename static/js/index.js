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
						<h3>Board Information</h3>
					</div>
					<div class="module-body block-wrapper">
						<section class="block">
							<h4>Online Since</h4>
							<span>${new Date(data.initTime).toLocaleString('tr-TR', { timeZone: 'Europe/Rome' })}</span>
						</section>
						<section class="block">
							<h4>Relay Count</h4>
							<span>${getCount(data.controllable_pins, 'output')}</span>
						</section>
						<section class="block">
							<h4>Input Count</h4>
							<span>${getCount(data.controllable_pins, 'input')}</span>
						</section>
						<section class="block">
							<h4>Active Task Count</h4>
							<span>${Object.keys(data.activeTasks).length}</span>
						</section>
						<section class="block">
							<h4>Linked Pin Count</h4>
							<span>${Object.keys(data.links).length}</span>
						</section>
						<section class="block">
							<h4>I/O Data(XML)</h4>
							<span><a href="${(ipAddress != '' ? 'http://' + ipAddress : '') + '/data'}">Click Here</a></span>
						</section>
						<section class="block">
							<h4>I/O Data(JSON)</h4>
							<span><a href="${(ipAddress != '' ? 'http://' + ipAddress : '') + '/getConf'}">Click Here</a></span>
						</section>
					</div>
				</div>
			</div>
		</div>
				`;
			$('main#page-content').append(html);
		});

	});
}

const getCount = (obj, dir) => {
	var count = 0;
	Object.values(obj).forEach(item => {
		if(dir == 'output' && (item == '1' || item == '2')) {
			count = count + 1;
		} else if(dir == 'input' && item == '0') {
			count = count + 1;
		}
	});
	return count;
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
	setInterval(checkBoardConnection, 4000);

});
