function getWorldSocketPosition(part, socket) {
      part.updateMatrixWorld(true);
      return new THREE.Vector3(socket.x, socket.y, socket.z).applyMatrix4(part.matrixWorld);
    }

    function getLocalHoleCenter(socket) {
      const center = new THREE.Vector3(socket.x, socket.y, socket.z);
      if (socket.dir === 'vertical') center.y -= socket.y * 2;
      return center;
    }

    function getWorldHoleCenter(part, socket) {
      const surfacePosition = getWorldSocketPosition(part, socket);
      if (socket.dir !== 'vertical' || Math.abs(socket.y) < 0.001) return surfacePosition;

      const inwardOffset = new THREE.Vector3(0, socket.y * 2, 0)
        .applyQuaternion(part.getWorldQuaternion(new THREE.Quaternion()));
      return surfacePosition.sub(inwardOffset);
    }

    function getComponentSnapPosition(part, componentSocket, pinSocket) {
      return pinSocket.y < 0
        ? getWorldHoleCenter(part, componentSocket)
        : getWorldSocketPosition(part, componentSocket);
    }

    function getLocalComponentSnapPosition(componentSocket, pinSocket) {
      return pinSocket.y < 0
        ? getLocalHoleCenter(componentSocket)
        : new THREE.Vector3(componentSocket.x, componentSocket.y, componentSocket.z);
    }

    function getMagneticPartners(part) {
      const partners = [];
      joints.forEach(j => {
        if (!j.id.startsWith('magnetic_joint_')) return;
        if (j.partA === part && j.partB && !partners.includes(j.partB)) partners.push(j.partB);
        if (j.partB === part && j.partA && !partners.includes(j.partA)) partners.push(j.partA);
      });
      return partners;
    }

    function canMagneticallyReattach(part, targetPart) {
      const releaseParts = part.userData.magneticReleaseParts || [];
      if (!releaseParts.includes(targetPart)) return true;

      const origin = part.userData.magneticReleaseOrigin;
      const current = part.getWorldPosition(new THREE.Vector3());
      if (!origin || current.distanceTo(origin) > 0.65) {
        part.userData.magneticReleaseParts = [];
        part.userData.magneticReleaseOrigin = null;
        return true;
      }
      return false;
    }

    function findNearestPinSnap(pin, maxDistance = 1.0) {
      const pinSockets = pin.userData.holes || [];
      let nearest = null;
      pin.updateMatrixWorld(true);

      const pinWorldPosition = pin.getWorldPosition(new THREE.Vector3());
      const pinBounds = new THREE.Box3();
      pin.traverse(child => {
        if (child.isMesh && !child.userData.isBadge && child.parent?.name !== 'badges') {
          pinBounds.expandByObject(child);
        }
      });
      const pinBottomOffset = pinBounds.min.y - pinWorldPosition.y;

      for (const pinSocket of pinSockets) {
        for (const targetPart of parts) {
          if (targetPart === pin || targetPart.userData?.isPin) continue;
          if (!canMagneticallyReattach(pin, targetPart)) continue;
          if (isMagneticSocketOccupied(pin, pinSocket, targetPart)) continue;

          for (const targetSocket of targetPart.userData?.holes || []) {
            if (isMagneticSocketOccupied(targetPart, targetSocket, pin)) continue;
            const targetPosition = getComponentSnapPosition(targetPart, targetSocket, pinSocket);
            const alignedQuaternion = targetPart.getWorldQuaternion(new THREE.Quaternion());
            const rotatedSocket = new THREE.Vector3(pinSocket.x, pinSocket.y, pinSocket.z)
              .applyQuaternion(alignedQuaternion);
            const desiredWorldPosition = targetPosition.clone().sub(rotatedSocket);
            const distance = pinWorldPosition.distanceTo(desiredWorldPosition);
            const snapDistance = Math.max(maxDistance, targetPart.userData?.holesCount >= 11 ? 1.5 : 0);
            if (distance > snapDistance) continue;

            const wouldPenetrateGround = desiredWorldPosition.y + pinBottomOffset < -0.01;
            if (wouldPenetrateGround) continue;

            if (!nearest || distance < nearest.distance) {
              nearest = { pinSocket, targetPart, targetSocket, targetPosition, distance };
            }
          }
        }
      }

      return nearest;
    }

    function findNearestComponentSnap(part, maxDistance = 1.0) {
      const componentSockets = part.userData.holes || [];
      let nearest = null;

      for (const componentSocket of componentSockets) {
        const holePosition = getWorldSocketPosition(part, componentSocket);
        for (const pin of parts) {
          if (!pin.userData?.isPin || pin === part) continue;
          if (!canMagneticallyReattach(part, pin)) continue;

          for (const pinSocket of pin.userData.holes || []) {
            if (isMagneticSocketOccupied(pin, pinSocket, part)) continue;
            if (isMagneticSocketOccupied(part, componentSocket, pin)) continue;
            const holePosition = getComponentSnapPosition(part, componentSocket, pinSocket);
            const pinPosition = getWorldSocketPosition(pin, pinSocket);
            const distance = holePosition.distanceTo(pinPosition);
            const snapDistance = Math.max(maxDistance, part.userData?.holesCount >= 11 ? 1.5 : 0);
            if (distance <= snapDistance && (!nearest || distance < nearest.distance)) {
              nearest = { componentSocket, pin, pinSocket, pinPosition, distance };
            }
          }
        }
      }

      return nearest;
    }

    function isMagneticSocketOccupied(part, socket, exceptPart = null) {
      return joints.some(j => {
        if (!j.id.startsWith('magnetic_joint_')) return false;
        if (j.partA === exceptPart || j.partB === exceptPart) return false;
        return (j.partA === part && socketsMatch(j.socketA, socket)) ||
          (j.partB === part && socketsMatch(j.socketB, socket));
      });
    }

    function socketsMatch(firstSocket, secondSocket) {
      if (firstSocket === secondSocket) return true;
      return Boolean(firstSocket && secondSocket &&
        firstSocket.index === secondSocket.index &&
        firstSocket.dir === secondSocket.dir);
    }

    function detachMagneticJoints(part) {
      const detached = joints.some(j => j.id.startsWith('magnetic_joint_') &&
        (j.partA === part || j.partB === part || j.pin === part));
      if (!detached) return;

      joints = joints.filter(j => !(j.id.startsWith('magnetic_joint_') &&
        (j.partA === part || j.partB === part || j.pin === part)));
      part.userData.magneticJointId = null;
      part.userData.magneticSnapped = false;
      updateJointsUI();
    }

    function detachMagneticSocket(part, socket) {
      const previousLength = joints.length;
      joints = joints.filter(j => {
        if (!j.id.startsWith('magnetic_joint_')) return true;
        const usesSocket = (j.partA === part && socketsMatch(j.socketA, socket)) ||
          (j.partB === part && socketsMatch(j.socketB, socket));
        return !usesSocket;
      });

      if (joints.length !== previousLength) updateJointsUI();
    }

    function detachPinJoints(pin) {
      detachMagneticJoints(pin);
    }

    // ==========================================
    // HỆ THỐNG QUẢN LÝ CỤM LẮP RÁP (ASSEMBLY)
    // ==========================================

    let rotationPivotGroup = null;
    let rotationPivotPart = null;
    let rotationPivotParents = new Map();

    function getConnectedPins(part) {
      return [...new Set(joints.map(joint => joint.pin)
        .filter(pin => pin?.userData?.isPin && getPinParticipants(pin).has(part)))];
    }

    function getPinParticipants(pin) {
      const participants = new Set();
      joints.forEach(joint => {
        if (joint.pin !== pin) return;
        [joint.partA, joint.partB].forEach(part => {
          if (part && part !== pin && !part.userData?.isPin) participants.add(part);
        });
      });
      return participants;
    }

    function restoreRotationPivot() {
      if (!rotationPivotGroup) return;

      [...rotationPivotParents.entries()].reverse().forEach(([member, originalParent]) => {
        if (originalParent?.parent) originalParent.attach(member);
        else scene.attach(member);
      });
      rotationPivotGroup.parent?.remove(rotationPivotGroup);
      rotationPivotGroup = null;
      rotationPivotPart = null;
      rotationPivotParents.clear();
    }

    function createRotationPivot(part, mode = toolMode) {
      if (rotationPivotGroup && rotationPivotPart === part) return rotationPivotGroup;
      restoreRotationPivot();

      const getNode = object => object?.parent?.userData.isAssemblyGroup &&
        !object.parent.userData.isRotationPivotGroup ? object.parent : object;
      const adjacency = new Map();
      const connected = new Map();
      const incomingPivotPins = new Map();
      const connect = (parent, child) => {
        if (!parent || !child || parent === child) return;
        if (!adjacency.has(parent)) adjacency.set(parent, new Set());
        adjacency.get(parent).add(child);
        if (!connected.has(parent)) connected.set(parent, new Set());
        if (!connected.has(child)) connected.set(child, new Set());
        connected.get(parent).add(child);
        connected.get(child).add(parent);
      };

      joints.forEach(joint => {
        const pin = getNode(joint.pin);
        const explicitParent = joint.kinematicParent;
        const explicitChild = joint.kinematicChild;
        if (explicitParent && explicitChild) {
          const parent = getNode(explicitParent);
          const child = getNode(explicitChild);
          if (joint.pin && joint.pin !== explicitParent && joint.pin !== explicitChild) {
            connect(parent, pin);
            connect(pin, child);
            incomingPivotPins.set(child, joint.pin);
          } else {
            connect(parent, child);
            if (joint.pin === explicitParent) incomingPivotPins.set(child, joint.pin);
          }
          return;
        }

        const first = getNode(joint.partA);
        const second = getNode(joint.partB);
        if (!pin) {
          connect(first, second);
        } else if (joint.pin === joint.partA) {
          if (joint.pin.userData?.magneticJointId === joint.id) connect(second, pin);
          else if (joint.pin.userData?.magneticJointId) {
            connect(pin, second);
            incomingPivotPins.set(second, joint.pin);
          } else connect(second, pin);
        } else if (joint.pin === joint.partB) {
          if (joint.pin.userData?.magneticJointId === joint.id) connect(first, pin);
          else if (joint.pin.userData?.magneticJointId) {
            connect(pin, first);
            incomingPivotPins.set(first, joint.pin);
          } else connect(first, pin);
        } else {
          connect(first, pin);
          connect(pin, second);
          incomingPivotPins.set(second, joint.pin);
        }
      });

      const rootNode = getNode(part);
      const hingePin = mode === 'rotate' ? incomingPivotPins.get(rootNode) : null;
      const traversal = mode === 'rotate' ? adjacency : connected;
      const pending = [rootNode];
      const visited = new Set();
      const parentNodes = new Map();
      while (pending.length) {
        const current = pending.shift();
        if (!current || visited.has(current)) continue;
        visited.add(current);
        for (const child of traversal.get(current) || []) {
          if (visited.has(child)) continue;
          parentNodes.set(child, current);
          pending.push(child);
        }
      }
      if (visited.size < 2 && !hingePin) return null;

      scene.updateMatrixWorld(true);
      const pivotPosition = hingePin
        ? hingePin.getWorldPosition(new THREE.Vector3())
        : part.getWorldPosition(new THREE.Vector3());
      const pivotGroup = new THREE.Group();
      pivotGroup.userData.isAssemblyGroup = true;
      pivotGroup.userData.isRotationPivotGroup = true;
      pivotGroup.position.copy(pivotPosition);
      scene.add(pivotGroup);

      rotationPivotParents = new Map([...visited].map(node => [node, node.parent]));
      rotationPivotGroup = pivotGroup;
      rotationPivotPart = part;
      pivotGroup.attach(rootNode);
      parentNodes.forEach((parent, child) => parent.attach(child));
      return pivotGroup;
    }

    function getTransformTargetForPart(part, mode = toolMode) {
      const pivotGroup = mode === 'rotate' || mode === 'translate' ? createRotationPivot(part, mode) : null;
      return pivotGroup || (part.parent?.userData.isAssemblyGroup ? part.parent : part);
    }

    function lockIntoAssembly() {
      reconcileRigidAssemblies();
    }

    function reconcileRigidAssemblies() {
      restoreRotationPivot();
      const structuralParts = parts.filter(part => !part.userData?.isPin);
      const pinsByPair = new Map();

      [...new Set(joints.map(joint => joint.pin).filter(pin => pin?.userData?.isPin))]
        .forEach(pin => {
          const participants = [...getPinParticipants(pin)].filter(part => structuralParts.includes(part));
          for (let firstIndex = 0; firstIndex < participants.length; firstIndex++) {
            for (let secondIndex = firstIndex + 1; secondIndex < participants.length; secondIndex++) {
              const first = participants[firstIndex];
              const second = participants[secondIndex];
              const key = [first.userData.id, second.userData.id].sort().join('|');
              if (!pinsByPair.has(key)) pinsByPair.set(key, { parts: [first, second], pins: new Set() });
              pinsByPair.get(key).pins.add(pin);
            }
          }
        });

      const connections = new Map(structuralParts.map(part => [part, new Set()]));
      pinsByPair.forEach(({ parts: pairParts, pins }) => {
        if (pins.size < 2) return;
        connections.get(pairParts[0]).add(pairParts[1]);
        connections.get(pairParts[1]).add(pairParts[0]);
      });

      const oldGroups = new Set(parts
        .map(part => part.parent)
        .filter(parent => parent?.userData.isAssemblyGroup && !parent.userData.isRotationPivotGroup));
      oldGroups.forEach(group => {
        [...group.children].forEach(child => scene.attach(child));
        group.parent?.remove(group);
      });

      const remaining = new Set(structuralParts);
      while (remaining.size) {
        const component = new Set();
        const pending = [remaining.values().next().value];
        while (pending.length) {
          const current = pending.pop();
          if (!remaining.delete(current)) continue;
          component.add(current);
          connections.get(current).forEach(neighbor => pending.push(neighbor));
        }
        if (component.size < 2) continue;

        const members = [...component];
        const componentPins = [...new Set(joints.map(joint => joint.pin).filter(pin => pin?.userData?.isPin))]
          .filter(pin => {
            const participants = getPinParticipants(pin);
            return participants.size > 0 && [...participants].every(part => component.has(part));
          });
        members.push(...componentPins);

        const assemblyGroup = new THREE.Group();
        assemblyGroup.userData.isAssemblyGroup = true;
        scene.add(assemblyGroup);
        members.forEach(member => assemblyGroup.attach(member));
      }
    }

    // Tách 1 linh kiện ra khỏi cụm
    function separatePartFromAssembly(part) {
      if (rotationPivotGroup) restoreRotationPivot();
      const linkedJoints = joints.filter(joint =>
        joint.partA === part || joint.partB === part || joint.pin === part);
      if (linkedJoints.length === 0) return false;

      const oldGroup = part.parent?.userData.isAssemblyGroup && !part.parent.userData.isRotationPivotGroup
        ? part.parent
        : null;
      if (oldGroup) {
        [...oldGroup.children].forEach(child => scene.attach(child));
        oldGroup.parent?.remove(oldGroup);
      } else {
        scene.attach(part);
      }

      joints = joints.filter(joint =>
        joint.partA !== part && joint.partB !== part && joint.pin !== part);
      if (part.userData) {
        part.userData.magneticJointId = null;
        part.userData.magneticSnapped = false;
      }

      reconcileRigidAssemblies();
      updateJointsUI();
      if (selectedPart === part) {
        if (toolMode === 'select') transformControls.detach();
        else {
          transformControls.attach(getTransformTargetForPart(part, toolMode));
          transformControls.setMode(toolMode === 'rotate' ? 'rotate' : 'translate');
        }
      }
      return true;
    }

    // Đảm bảo khi rút 1 chốt ở giữa, nếu cụm bị gãy làm đôi thì sẽ tự tách thành 2 cụm độc lập
    function rebuildAssemblyGroups(groupParts) {
      groupParts.forEach(member => scene.attach(member));
      reconcileRigidAssemblies();
    }

    // HÀM HỖ TRỢ ĐỈNH CAO: Tự động tính toán để di chuyển cả Cụm hoặc Linh kiện đơn lẻ cực kỳ chuẩn xác
    function movePartToDesiredWorld(part, desiredWorldPos, desiredWorldQuat) {
      const isGrouped = part.parent && part.parent.userData.isAssemblyGroup;
      const targetNode = isGrouped ? part.parent : part;

      if (isGrouped) {
        const partLocalQuat = part.quaternion.clone();
        targetNode.quaternion.copy(desiredWorldQuat.clone().multiply(partLocalQuat.invert()));
        targetNode.updateMatrixWorld(true);

        const currentPartWorldPos = part.getWorldPosition(new THREE.Vector3());
        const offset = desiredWorldPos.clone().sub(currentPartWorldPos);
        targetNode.position.add(offset);
        targetNode.updateMatrixWorld(true);
      } else {
        targetNode.quaternion.copy(desiredWorldQuat);
        targetNode.position.copy(desiredWorldPos);
        targetNode.updateMatrixWorld(true);
      }
    }

   function snapPinToHole(pin, snap) {
      const desiredWorldQuaternion = snap.targetPart.getWorldQuaternion(new THREE.Quaternion());
      const isHorizontal = snap.targetSocket && (snap.targetSocket.dir === 'horizontal' || snap.targetSocket.type === 'horizontal');
      if (isHorizontal) {
        desiredWorldQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
      }
      
      const rotatedSocket = new THREE.Vector3(snap.pinSocket.x, snap.pinSocket.y, snap.pinSocket.z)
        .applyQuaternion(desiredWorldQuaternion);
      const desiredWorldPosition = snap.targetPosition.clone().sub(rotatedSocket);

      // Gọi hàm hỗ trợ di chuyển
      movePartToDesiredWorld(pin, desiredWorldPosition, desiredWorldQuaternion);

      const currentJoint = joints.find(j => j.id.startsWith('magnetic_joint_') &&
        j.partA === pin && j.socketA === snap.pinSocket &&
        j.partB === snap.targetPart && j.socketB === snap.targetSocket);
        
      if (!currentJoint || currentJoint.partB !== snap.targetPart || currentJoint.socketB !== snap.targetSocket) {
        detachMagneticSocket(pin, snap.pinSocket);
        detachMagneticSocket(snap.targetPart, snap.targetSocket);
        const jointId = 'magnetic_joint_' + Date.now();
        joints.push({
          id: jointId,
          partA: pin,
          partB: snap.targetPart,
          socketA: snap.pinSocket,
          socketB: snap.targetSocket,
          pin,
          kinematicParent: snap.targetPart,
          kinematicChild: pin
        });
        
        // ĐÃ XÓA LỆNH KHÓA CỤM Ở ĐÂY ĐỂ TRÁNH GIẬT CHUỘT
        pin.userData.magneticJointId = jointId;
        pin.userData.magneticSnapped = true;
        if (typeof updateJointsUI === 'function') updateJointsUI();
      }
    }

    function snapComponentToPin(part, snap) {
      const desiredWorldQuaternion = part.getWorldQuaternion(new THREE.Quaternion());

      const rotatedHole = getLocalComponentSnapPosition(snap.componentSocket, snap.pinSocket)
        .applyQuaternion(desiredWorldQuaternion);
      const desiredWorldPosition = snap.pinPosition.clone().sub(rotatedHole);

      movePartToDesiredWorld(part, desiredWorldPosition, desiredWorldQuaternion);

      const currentJoint = joints.find(j => j.id.startsWith('magnetic_joint_') &&
        j.partA === snap.pin && j.socketA === snap.pinSocket &&
        j.partB === part && j.socketB === snap.componentSocket);

      if (!currentJoint || currentJoint.partA !== snap.pin || currentJoint.socketA !== snap.pinSocket) {
        detachMagneticSocket(part, snap.componentSocket);
        detachMagneticSocket(snap.pin, snap.pinSocket);
        const jointId = 'magnetic_joint_' + Date.now();
        const pinHasSupport = getPinParticipants(snap.pin).size > 0;
        const kinematicParent = pinHasSupport ? snap.pin : part;
        const kinematicChild = pinHasSupport ? part : snap.pin;
        joints.push({
          id: jointId,
          partA: snap.pin,
          partB: part,
          socketA: snap.pinSocket,
          socketB: snap.componentSocket,
          pin: snap.pin,
          kinematicParent,
          kinematicChild
        });

        part.userData.magneticJointId = jointId;
        part.userData.magneticSnapped = true;
        if (typeof updateJointsUI === 'function') updateJointsUI();
      }
    }