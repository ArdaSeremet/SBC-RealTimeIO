#!/bin/bash

trap ctrl_c INT
function ctrl_c() {
	echo 'Program interrupted! Exiting...'
	exit 1
}

echo 'Please specify the port number for SSH Tunneling: '
read tunnelPort
echo '----'

echo 'Updating package repos ==> '
sudo apt-get update
echo '----'

echo 'Installing Curl, AutoSSH and Git ==> '
sudo apt-get install curl git autossh -y
echo '----'

echo 'Going to home directory ==> '
cd ~
echo '----'

echo 'Installing NodeJS Version 10'
curl -sL https://deb.nodesource.com/setup_12.x -o nodesource_setup.sh
sudo chmod +x ./nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo rm nodesource_setup.sh
sudo apt-get install nodejs -y
echo '----'

echo 'Getting project files from Github'
cd ~
git clone https://github.com/ArdaSeremet/SBC-RealTimeIO.git
cd SBC-RealTimeIO
npm install
echo '----'

echo 'Setting MAC address for security file.'
macAddress=$(cat /sys/class/net/eth0/address)
macAddress=${macAddress: -5}
sudo touch security.txt
echo $macAddress >> security.txt
echo '----'

echo 'Setting systemd daemon for system bootup'
sudo rm /etc/systemd/system/gpioctrl.service
cat >> /etc/systemd/system/gpioctrl.service <<EOF
[Unit]
Description=Realtime GPIO Controller for OPiZero, NanoPiNEO-LTS and RockPiS

[Service]
User=root
Restart=always
KillSignal=SIGQUIT
WorkingDirectory=/root/SBC-RealTimeIO/
ExecStart=/root/SBC-RealTimeIO/app.js

[Install]
WantedBy=multi-user.target
EOF
echo '----'

echo 'Setting systemd daemon for SSH tunneling'
sudo rm /etc/systemd/system/tunnel-do.service
cat >> /etc/systemd/system/tunnel-do.service <<EOF
[Unit]
Description=AutoSSH tunnel service for reverse tunneling
After=network-online.target

[Service]
Environment="AUTOSSH_GATETIME=0"
ExecStart=/usr/bin/autossh -M 0 -N -o UserKnownHostsFile=/dev/null -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=no -R $(echo "$tunnelPort"):localhost:80 root@64.227.122.63 -p 22

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable gpioctrl
sudo systemctl enable tunnel-do
echo '----'

echo 'Generating a brand-new SSH key'
ssh-keygen -t rsa -b 4096 -C "ardaseremet@outlook.com" -N "" -f /root/.ssh/id_rsa
echo '----'

echo 'Copying SSH key to remote machine'
ssh-copy-id root@64.227.122.63
echo '----'

echo 'Running the server and SSH Tunnel services'
sudo systemctl start gpioctrl
sudo systemctl start tunnel-do
echo '----'

echo 'Done installing the script! Have a nice day!'
