let scene, camera, renderer, controls;
let playerObject;
let objects = [];
let rollOverMesh, rollOverMaterial;
let raycaster;

const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let triggerJump = false;
let isGrounded = false;

const playerSpeed = 8.0;
const playerHeight = 1.8; // Eyes from feet
const worldSize = 20;
const gravity = 25; // Increased gravity slightly
const jumpHeight = 1.2; // Desired jump height in units
const max_interaction = 5;

const blockTypes = {
	grass: 0x85cc60, dirt: 0x9b7653, stone: 0x808080,
	wood: 0xab855f, leaves: 0x4CAF50, sand: 0xf4a460,
};
const blockTypeNames = Object.keys(blockTypes);
let selectedBlockType = 'grass';
let selectedBlockIndex = blockTypeNames.indexOf(selectedBlockType);

const pointer = new THREE.Vector2();
let lastTime = performance.now();
// let stats; // For FPS counter

window.onload = function() {
	init();
	animate();
};

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 10, 90);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    const gameContainer = document.getElementById('game-container');
    renderer.setSize(window.innerWidth, gameContainer.clientHeight);
    gameContainer.appendChild(renderer.domElement);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / getGameContainerHeight(), 0.1, 1000);
    // Camera's local Y position will be playerHeight, relative to playerObject.

    // 1. Create the player container (represents feet position and collision body)
    playerObject = new THREE.Object3D();
    playerObject.name = "PlayerContainer";
    playerObject.position.set(0, 0, 5); // Initial world position of player's feet
    scene.add(playerObject);

    // 2. Add camera as a child of the player container, offset by playerHeight
    camera.position.set(0, playerHeight, 0); // Local position relative to playerObject
    playerObject.add(camera);

    // 3. Initialize PointerLockControls with the camera.
    // PLC will control the camera's orientation. Movement is handled by us via playerObject.
    controls = new THREE.PointerLockControls(camera, renderer.domElement);

    // Logging to confirm setup:
    console.log(`INIT: Camera LOCAL Y (relative to playerObject): ${camera.position.y} (intended playerHeight: ${playerHeight})`);
    console.log(`INIT: playerObject WORLD Y: ${playerObject.position.y}`);
    let camWorldPos = new THREE.Vector3();
    camera.getWorldPosition(camWorldPos); // Get camera's actual world position
    console.log(`INIT: Camera WORLD Y: ${camWorldPos.y.toFixed(3)} (should be playerObject.y + camera.local.y)`);
    console.log(`INIT: Camera parent is: ${camera.parent ? camera.parent.name || camera.parent.constructor.name : 'null'} (should be PlayerContainer)`);


    const blocker = document.getElementById('blocker');
    const instructions = document.getElementById('instructions');
    const crosshair = document.getElementById('crosshair');

    instructions.addEventListener('click', () => controls.lock());

    controls.addEventListener('lock', () => {
        instructions.style.display = 'none'; blocker.style.display = 'none'; crosshair.style.display = 'block';
    });

    controls.addEventListener('unlock', () => {
        blocker.style.display = 'flex'; instructions.style.display = ''; crosshair.style.display = 'none';
    });

    // We already added playerObject to the THREE.Scene, which contains the camera.
    // So, no need to add controls.object (the camera) separately.

	raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0,0,0), 0, max_interaction);

	// --- Lighting ---
	const AmbientLight = new THREE.AmbientLight(0xcccccc, 0.9);
	scene.add(AmbientLight);
	const DirectionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
	DirectionalLight.position.set(1, 1.5, 0.8).normalize();
	scene.add(DirectionalLight);

	// --- Initial World (Ground & Random Blocks) ---
	for (let x = -worldSize / 2; x < worldSize / 2; x++) {
		for (let z = -worldSize / 2; z < worldSize / 2; z++) {
			const grassBlock = createBlock(x + 0.5, -0.5, z + 0.5, 'grass');
			scene.add(grassBlock);
			objects.push(grassBlock);

			// Add some random dirt below the grass (optional, but common)
			const dirtBlock = createBlock(x + 0.5, -1.5, z + 0.5, 'dirt'); // Dirt below grass
			scene.add(dirtBlock);
			objects.push(dirtBlock);

			// Add random stone/wood features on top of grass
			if (Math.random() < 0.04 && (x !== 0 || z !== 0)) {
				const height = Math.floor(Math.random() * 2) + 1;
				for (let y = 0; y < height; y++) {
					const blockType = Math.random() < 0.6 ? 'stone' : (Math.random() < 0.5 ? 'wood' : 'sand');
					const block = createBlock(x + 0.5, y + 0.5, z + 0.5, blockType); // On top of grass
					scene.add(block);
					objects.push(block);
				}
			}
		}
	}

	// --- Roll-over helpers ---
	const rollOverGeo = new THREE.BoxGeometry(1.01, 1.01, 1.01); // Slightly larger to avoid z-fighting
	rollOverMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, opacity: 0.5, transparent: true });
	rollOverMesh = new THREE.Mesh(rollOverGeo, rollOverMaterial);
	scene.add(rollOverMesh);

	document.addEventListener('keydown', onKeyDown);
	document.addEventListener('keyup', onKeyUp);
	window.addEventListener('resize', onWindowResize);
	renderer.domElement.addEventListener('mousedown', onMouseDown);
	renderer.domElement.addEventListener('wheel', onMouseWheel, { passive: false });

	setupBlockSelectionUI();
	updateBlockSelectionUI();
}

function getGameContainerHeight() {
	const container = document.getElementById('game-container');
	return container ? container.clientHeight : window.innerHeight * 0.8;
}

function createBlock(x, y, z, type) {
	const blockGeo = new THREE.BoxGeometry(1, 1, 1);
	const color = blockTypes[type] !== undefined ? blockTypes[type] : 0xffffff;
	const blockMat = new THREE.MeshLambertMaterial({ color: color });
	const block = new THREE.Mesh(blockGeo, blockMat);
	block.position.set(x, y, z);
	block.userData.type = type;
	block.name = type + "_block"; // For easier debugging
	return block;
}

function onWindowResize() {
	const gameContainerHeight = getGameContainerHeight();
	camera.aspect = window.innerWidth / gameContainerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, gameContainerHeight);
}

function onKeyDown(event) {
	switch (event.code) {
		case 'KeyW': case 'ArrowUp': moveForward = true; break;
		case 'KeyS': case 'ArrowDown': moveBackward = true; break;
		case 'KeyA': case 'ArrowLeft': moveLeft = true; break;
		case 'KeyD': case 'ArrowRight': moveRight = true; break;
		case 'Space': triggerJump = true; break;
	}
}
function onKeyUp(event) {
	switch (event.code) {
		case 'KeyW': case 'ArrowUp': moveForward = false; break;
		case 'KeyS': case 'ArrowDown': moveBackward = false; break;
		case 'KeyA': case 'ArrowLeft': moveLeft = false; break;
		case 'KeyD': case 'ArrowRight': moveRight = false; break;
		case 'Space': triggerJump = false; break;
	}
}

function playerCollidesWithPosition(blockPos) {
	const playerFeetPos = playerObject.position;
	const effectivePlayerHeight = playerHeight - 0.01;
	const playerBox = new THREE.Box3();
	playerBox.min.set(playerFeetPos.x - 0.4, playerFeetPos.y, playerFeetPos.z - 0.4);
	playerBox.max.set(playerFeetPos.x + 0.4, playerFeetPos.y + effectivePlayerHeight, playerFeetPos.z + 0.4);
	const blockCenter = blockPos.clone();
	const tempBlockBox = new THREE.Box3().setFromCenterAndSize(blockCenter, new THREE.Vector3(1,1,1));
	return playerBox.intersectsBox(tempBlockBox);
}

function onMouseDown(event) {
	if (!controls.isLocked && crosshair.style.display === 'none') {
		if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
			 if (blocker.style.display !== 'none') return;
		} else {
			return;
		}
	}

	raycaster.setFromCamera({x:0, y:0}, camera); // Raycast from center of screen
	const intersects = raycaster.intersectObjects(objects, false);

	if (intersects.length > 0) {
		const intersect = intersects[0];
		if (event.button === 0) { // Left click: Remove
			if (intersect.object.geometry.type === "BoxGeometry" && objects.includes(intersect.object)) {
				scene.remove(intersect.object);
				objects.splice(objects.indexOf(intersect.object), 1);
			}
		} else if (event.button === 2) { // Right click: Place
			if (rollOverMesh.visible) {
				const newBlockPos = rollOverMesh.position.clone();
				if (!isOccupied(newBlockPos) && !playerCollidesWithPosition(newBlockPos)) {
					const voxel = createBlock(newBlockPos.x, newBlockPos.y, newBlockPos.z, selectedBlockType);
					scene.add(voxel);
					objects.push(voxel);
				}
			}
		}
	}
}


function onMouseWheel(event) {
	event.preventDefault();
	selectedBlockIndex += Math.sign(event.deltaY);
	if (selectedBlockIndex < 0) {
		selectedBlockIndex = blockTypeNames.length - 1;
	} else if (selectedBlockIndex >= blockTypeNames.length) {
		selectedBlockIndex = 0;
	}

	selectedBlockType = blockTypeNames[selectedBlockIndex];
	updateBlockSelectionUI();
}

function setupBlockSelectionUI() {
	const blockSelectionDiv = document.getElementById('block-selection');
	blockSelectionDiv.innerHTML = '';
	blockTypeNames.forEach(typeName => {
		const button = document.createElement('button');
		button.textContent = typeName.charAt(0).toUpperCase() + typeName.slice(1);
		button.classList.add('control-button');
		button.style.backgroundColor = '#' + blockTypes[typeName].toString(16).padStart(6, '0');
		button.addEventListener('click', () => {
			selectedBlockType = typeName;
			selectedBlockIndex = blockTypeNames.indexOf(selectedBlockType);
			updateBlockSelectionUI();
		});
		blockSelectionDiv.appendChild(button);
	});
}

function updateBlockSelectionUI() {
	document.querySelectorAll('#block-selection .control-button').forEach(btn => {
		btn.classList.toggle('selected', btn.textContent.toLowerCase() === selectedBlockType);
	});
}

function isOccupied(position) {
	const tolerance = 0.1;
	for (let obj of objects) {
		if (obj.geometry.type === "BoxGeometry") {
			if (Math.abs(obj.position.x - position.x) < tolerance &&
				Math.abs(obj.position.y - position.y) < tolerance &&
				Math.abs(obj.position.z - position.z) < tolerance) {
				return true;
			}
		}
	}
	return false;
}

// Simplified collision check for X and Z movement (side collisions)
function checkSideCollision(objToCollide) {
	const playerPos = objToCollide.position; // Feet position
	const collisionPlayerHeight = playerHeight - 0.1; // Effective collision height of player
	const playerCollider = new THREE.Box3();
	// Define player's bounding box based on feet position and height
	playerCollider.min.set(playerPos.x - 0.4, playerPos.y + 0.05, playerPos.z - 0.4); // Small offset from ground
	playerCollider.max.set(playerPos.x + 0.4, playerPos.y + collisionPlayerHeight - 0.05, playerPos.z + 0.4);

	for (let obj of objects) {
		if (obj.geometry.type !== "BoxGeometry" || obj === rollOverMesh) continue;
		const blockBox = new THREE.Box3().setFromObject(obj);
		if (playerCollider.intersectsBox(blockBox)) {
			return true;
		}
	}
	return false;
}

function animate() {
	// stats.begin(); // If using Stats.js
	requestAnimationFrame(animate);

	const time = performance.now();
	const delta = Math.min(0.1, (time - lastTime) / 1000); // Cap delta to prevent large jumps
	lastTime = time;
	
	if (playerObject === camera) {
    	console.error("CRITICAL DEBUG: playerObject IS THE SAME AS camera!");
	}
	// --- Roll-over Mesh ---
	if (controls.isLocked || crosshair.style.display !== 'none') {
		raycaster.setFromCamera({ x: 0, y: 0 }, camera);

		const intersects = raycaster.intersectObjects(objects.filter(o => o.geometry.type === "BoxGeometry"), false);
		
		if (intersects.length > 0) {
			const intersect = intersects[0];
			const normal = intersect.face.normal.clone();

			rollOverMesh.position.copy(intersect.object.position).add(normal);
			rollOverMesh.position.floor().addScalar(0.5); // Snap to grid
			rollOverMesh.visible = true;
		} else {
			rollOverMesh.visible = false;
		}
	} else {
		rollOverMesh.visible = false;
	}
	

	// --- Movement Logic ---
	if (controls.isLocked === true) { // Allow movement if game is active
		// Horizontal movement damping
		playerVelocity.x -= playerVelocity.x * 10.0 * delta;
		playerVelocity.z -= playerVelocity.z * 10.0 * delta;

		// --- Get flat forward and right vectors from camera ---
		const camDirection = new THREE.Vector3();
		camera.getWorldDirection(camDirection);
		camDirection.y = 0;
		camDirection.normalize();
		
		const camRight = new THREE.Vector3();
		camRight.crossVectors(camDirection, new THREE.Vector3(0, 1, 0)).normalize();

		// --- Build movement direction ---
		playerDirection.set(0, 0, 0);
		if (moveForward) playerDirection.add(camDirection);
		if (moveBackward) playerDirection.sub(camDirection);
		if (moveRight) playerDirection.add(camRight);
		if (moveLeft) playerDirection.sub(camRight);
		playerDirection.normalize();
		

		// --- Apply friction and acceleration ---
		playerVelocity.x -= playerVelocity.x * 5.0 * delta;
		playerVelocity.z -= playerVelocity.z * 5.0 * delta;

		playerVelocity.x += playerDirection.x * playerSpeed * delta * 5;
		playerVelocity.z += playerDirection.z * playerSpeed * delta * 5;
		

		// --- Apply X and Z movement with collision ---
		const oldPosX = playerObject.position.x;
		playerObject.position.x += playerVelocity.x * delta;
		if (checkSideCollision(playerObject)) {
			playerObject.position.x = oldPosX;
			playerVelocity.x = 0;
		}

		const oldPosZ = playerObject.position.z;
		playerObject.position.z += playerVelocity.z * delta;
		if (checkSideCollision(playerObject)) {
			playerObject.position.z = oldPosZ;
			playerVelocity.z = 0;
		}


		// --- Jumping and Gravity ---
		if (triggerJump && isGrounded) {
			playerVelocity.y = Math.sqrt(2 * jumpHeight * gravity); // Calculate jump velocity for desired height
			isGrounded = false;
		}
		triggerJump = false; // Consume jump trigger
		
		
		//console.log(`PRE-GRAVITY: CamLocalY: ${camera.position.y.toFixed(3)}, PlayerWorldY: ${playerObject.position.y.toFixed(3)}`);

		playerVelocity.y -= gravity * delta; // Apply gravity

		const oldPosY = playerObject.position.y;
		playerObject.position.y += playerVelocity.y * delta; // Player object's WORLD Y position updates

		//console.log(`POST-GRAVITY/Y-MOVE: CamLocalY: ${camera.position.y.toFixed(3)}, PlayerWorldY: ${playerObject.position.y.toFixed(3)}`);

		let landedThisFrame = false;
		let hitHeadThisFrame = false;

		// Define player's vertical collision box (feet to head)
		const collisionPlayerFullHeight = playerHeight - 0.01; // Slightly less than visual height
		const playerVerticalCollider = new THREE.Box3();
		playerVerticalCollider.min.set(playerObject.position.x - 0.4, playerObject.position.y, playerObject.position.z - 0.4);
		playerVerticalCollider.max.set(playerObject.position.x + 0.4, playerObject.position.y + collisionPlayerFullHeight, playerObject.position.z + 0.4);

		for (let obj of objects) {
			if (obj.geometry.type !== "BoxGeometry" || obj === rollOverMesh) continue;
			const blockBox = new THREE.Box3().setFromObject(obj);

			if (playerVerticalCollider.intersectsBox(blockBox)) {
				// Landing check: Was moving down, feet were above block, now feet are in/below block top
				if (playerVelocity.y <= 0 && oldPosY >= blockBox.max.y - 0.01 && playerObject.position.y < blockBox.max.y) {
					playerObject.position.y = blockBox.max.y; // Snap feet to top of block
					playerVelocity.y = 0;
					isGrounded = true;
					landedThisFrame = true;
					break; // Resolved landing
				}
				// Head collision check: Was moving up, head was below block bottom, now head is in/above block bottom
				const oldHeadY = oldPosY + collisionPlayerFullHeight;
				const currentHeadY = playerObject.position.y + collisionPlayerFullHeight;
				if (playerVelocity.y > 0 && oldHeadY <= blockBox.min.y + 0.01 && currentHeadY > blockBox.min.y) {
					playerObject.position.y = blockBox.min.y - collisionPlayerFullHeight; // Snap head below block
					playerVelocity.y = 0;
					hitHeadThisFrame = true;
					isGrounded = false;
					break; // Resolved head collision
				}
			}
		}
		
		// If no specific landing or head hit resolved the collision, but still intersecting (e.g. side scrape during fall)
		if (!landedThisFrame && !hitHeadThisFrame) {
			const queryBox = playerVerticalCollider.clone(); // Use a fresh box for this broad check
			const intersectingBlock = objects.find(o => o.geometry.type === "BoxGeometry" && o !== rollOverMesh && queryBox.intersectsBox(new THREE.Box3().setFromObject(o)));
			if (intersectingBlock && checkSideCollision(playerObject)) { // Check if truly stuck
					if (playerObject.position.y < oldPosY) { // If ended up lower due to interpenetration
					const blockBox = new THREE.Box3().setFromObject(intersectingBlock);
					playerObject.position.y = blockBox.max.y; // Try to place on top
					isGrounded = true;
				} else { // Potentially stuck in side or pushing up
					playerObject.position.y = oldPosY; // Revert Y
				}
				playerVelocity.y = 0; // Stop Y movement
			}
		}
		

		if (!landedThisFrame && !hitHeadThisFrame && playerVelocity.y !== 0) { // If still moving vertically and no specific collision
				isGrounded = false;
		}

		// Final ground check if Y velocity is zero (e.g. standing still or just landed)
		if (playerVelocity.y === 0 && !landedThisFrame) { // Don't override if just landed
			const groundCheckBoxCenter = playerObject.position.clone().add(new THREE.Vector3(0, -0.05, 0)); // Check slightly below current feet
			const groundCheckBoxSize = new THREE.Vector3(0.7, 0.1, 0.7);
			const groundCheckBox = new THREE.Box3().setFromCenterAndSize(groundCheckBoxCenter, groundCheckBoxSize);
			let foundGround = false;
			for (let obj of objects) {
				if (obj.geometry.type !== "BoxGeometry" || obj === rollOverMesh) continue;
				const blockBox = new THREE.Box3().setFromObject(obj);
				if (groundCheckBox.intersectsBox(blockBox)) {
					// Snap to this ground if not already perfectly on it
					if (Math.abs(playerObject.position.y - blockBox.max.y) > 0.001) {
						playerObject.position.y = blockBox.max.y;
					}
					foundGround = true;
					break;
				}
			}
			isGrounded = foundGround;
		}
		

		// World boundaries (simple)
		const halfWorld = worldSize / 2 - 0.5;
		playerObject.position.x = Math.max(-halfWorld, Math.min(halfWorld, playerObject.position.x));
		playerObject.position.z = Math.max(-halfWorld, Math.min(halfWorld, playerObject.position.z));
		if (playerObject.position.y < -50) { // Fall out of world recovery
			playerObject.position.set(0, 10, 5);
			playerVelocity.set(0,0,0);
			isGrounded = false;
		}
	} 
	
	renderer.render(scene, camera);
	// stats.end(); // If using Stats.js
}
