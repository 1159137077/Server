"use strict";

require('../libs.js');

/* Move Item
* change location of item with parentId and slotId
* transfers items from one profile to another if fromOwner/toOwner is set in the body.
* otherwise, move is contained within the same profile_f.
* */
function moveItem(pmcData, body, sessionID) {
    item.resetOutput();

    let output = item.getOutput();
    let scavData = profile_f.getScavProfile(sessionID);

    if (typeof body.fromOwner !== 'undefined' && body.fromOwner.id === scavData._id) {
        // Handle changes to items from scav inventory should update the item
        if (typeof body.to.container === "undefined" || (body.to.container !== "main" && body.to.container !== "hideout")) {
            moveItemInternal(scavData, body);
            return output;
        }

        moveItemToProfile(scavData, pmcData, body);
        return output;
    }
    
    if (typeof body.toOwner !== 'undefined' && body.toOwner.id === scavData._id) {
        // Handle transfers from stash to scav.
        moveItemToProfile(pmcData, scavData, body);
        return output;
    }
    
    if (typeof body.fromOwner !== 'undefined' && body.fromOwner.type === 'Mail') {
        // If the item is coming from the mail, we need to get the item contents from the corresponding
        // message (denoted by fromOwner) and push them to player stash.
        let messageItems = dialogue_f.dialogueServer.getMessageItemContents(body.fromOwner.id, sessionID);
        let idsToMove = dialogue_f.findAndReturnChildren(messageItems, body.item);
        
        for (let itemId of idsToMove) {
            for (let messageItem of messageItems) {
                if (messageItem._id === itemId) {
                    pmcData.Inventory.items.push(messageItem);
                }
            }
        }

        moveItemInternal(pmcData, body);
        return output;
    }

    moveItemInternal(pmcData, body);
    return output;
}

/* Internal helper function to transfer an item from one profile to another.
* fromProfileData: Profile of the source.
* toProfileData: Profile of the destination.
* body: Move request
*/
function moveItemToProfile(fromProfileData, toProfileData, body) {
    handleCartridges(fromProfileData, body);

    let fromItems = fromProfileData.Inventory.items;
    let toItems = toProfileData.Inventory.items;
    let idsToMove = itm_hf.findAndReturnChildren(fromProfileData, body.item);

    for (let itemId of idsToMove) {
        for (let itemIndex in fromItems) {
            if (fromItems[itemIndex]._id && fromItems[itemIndex]._id === itemId) {
                if (itemId === body.item) {
                    fromItems[itemIndex].parentId = body.to.id;
                    fromItems[itemIndex].slotId = body.to.container;

                    if (typeof body.to.location !== "undefined") {
                        fromItems[itemIndex].location = body.to.location;
                    } else {
                        if (fromItems[itemIndex].location) {
                            delete fromItems[itemIndex].location;
                        }
                    }
                }

                toItems.push(fromItems[itemIndex]);
                fromItems.splice(itemIndex, 1);
            }
        }
    }
}

/* Internal helper function to move item within the same profile_f.
* profileData: Profile
* body: Move request
*/
function moveItemInternal(profileData, body) {
    handleCartridges(profileData, body);

    for (let item of profileData.Inventory.items) {
        if (item._id && item._id === body.item) {
            item.parentId = body.to.id;
            item.slotId = body.to.container;

            if (typeof body.to.location !== "undefined") {
                item.location = body.to.location;
            } else {
                if (item.location) {
                    delete item.location;
                }
            }

            return;
        }
    }
}

/* Internal helper function to handle cartridges in inventory if any of them exist.
* profileData: Profile
* body: Move request
*/
function handleCartridges(profileData, body) {
    // -> Move item to diffrent place - counts with equiping filling magazine etc
    if (body.to.container === 'cartridges') {
        let tmp_counter = 0;

        for (let item_ammo in profileData.Inventory.items) {
            if (body.to.id === profileData.Inventory.items[item_ammo].parentId) {
                tmp_counter++;
            }
        }

        body.to.location = tmp_counter;//wrong location for first cartrige
    }
}

/* Remove item of itemId and all of its descendants from profile. */
function removeItemFromProfile(profileData, itemId, output = null) {
    //get all ids related to this item, +including this item itself
    let ids_toremove = itm_hf.findAndReturnChildren(profileData, itemId);
    for (let i in ids_toremove) { //remove one by one all related items and itself
        if (output !== null) {
            output.data.items.del.push({"_id": ids_toremove[i]}); // Tell client to remove this from live game
        }

        for (let a in profileData.Inventory.items) { //find correct item by id and delete it
            if (profileData.Inventory.items[a]._id === ids_toremove[i]) {
                profileData.Inventory.items.splice(a, 1);  //remove item from pmcData
            }
        }
    }
}

/*
* Remove Item
* Deep tree item deletion / Delets main item and all sub items with sub items ... and so on.
*/
function removeItem(profileData, body, output, sessionID) {
    let toDo = [body];

    //Find the item and all of it's relates
    if (toDo[0] !== undefined && toDo[0] !== null && toDo[0] !== "undefined") {
        removeItemFromProfile(profileData, toDo[0], output);

        return output;
    }

    logger.logError("item id is not valid");
    return "BAD";
}

function discardItem(pmcData, body, sessionID) {
    insurance_f.remove(pmcData, body.item, sessionID);
    return removeItem(body.item, item.getOutput(), sessionID);
}

/* Split Item
* spliting 1 item into 2 separate items ...
* */
function splitItem(pmcData, body, sessionID) { // -> Spliting item / Create new item with splited amount and removing that amount from older one
    item.resetOutput();

    let output = item.getOutput();
    let location = body.container.location;
    
    if (typeof body.container.location === "undefined" && body.container.container === "cartridges") {
        let tmp_counter = 0;
    
        for (let item_ammo in pmcData.Inventory.items) {
            if (pmcData.Inventory.items[item_ammo].parentId === body.container.id) {
                tmp_counter++;
            }
        }
    
        location = tmp_counter;//wrong location for first cartrige
    }
    
    for (let item of pmcData.Inventory.items) {
        if (item._id && item._id === body.item) {
            item.upd.StackObjectsCount -= body.count;

            let newItem = utility.generateNewItemId();

            output.data.items.new.push({
                "_id": newItem,
                "_tpl": item._tpl,
                "parentId": body.container.id,
                "slotId": body.container.container,
                "location": location,
                "upd": {"StackObjectsCount": body.count}
            });

            pmcData.Inventory.items.push({
                "_id": newItem,
                "_tpl": item._tpl,
                "parentId": body.container.id,
                "slotId": body.container.container,
                "location": location,
                "upd": {"StackObjectsCount": body.count}
            });

            return output;
        }
    }

    return "";
}

/* Merge Item
* merges 2 items into one, deletes item from body.item and adding number of stacks into body.with
* */
function mergeItem(pmcData, body, sessionID) {
    item.resetOutput();

    let output = item.getOutput();

    for (let key in pmcData.Inventory.items) {
        if (pmcData.Inventory.items[key]._id && pmcData.Inventory.items[key]._id === body.with) {
            for (let key2 in pmcData.Inventory.items) {
                if (pmcData.Inventory.items[key2]._id && pmcData.Inventory.items[key2]._id === body.item) {
                    let stackItem0 = 1;
                    let stackItem1 = 1;

                    if (typeof pmcData.Inventory.items[key].upd !== "undefined") {
                        stackItem0 = pmcData.Inventory.items[key].upd.StackObjectsCount;
                    }

                    if (typeof pmcData.Inventory.items[key2].upd !== "undefined") {
                        stackItem1 = pmcData.Inventory.items[key2].upd.StackObjectsCount;
                    }

                    if (stackItem0 === 1) {
                        Object.assign(pmcData.Inventory.items[key], {"upd": {"StackObjectsCount": 1}});
                    }

                    pmcData.Inventory.items[key].upd.StackObjectsCount = stackItem0 + stackItem1;
                    output.data.items.del.push({"_id": pmcData.Inventory.items[key2]._id});
                    pmcData.Inventory.items.splice(key2, 1);
                    return output;
                }
            }
        }
    }

    return "";
}

/* Transfer item
* Used to take items from scav inventory into stash or to insert ammo into mags (shotgun ones) and reloading weapon by clicking "Reload"
* */
function transferItem(pmcData, body, sessionID) {
    item.resetOutput();

    let output = item.getOutput();

    for (let item of pmcData.Inventory.items) {
        // From item
        if (item._id === body.item) {
            let stackItem = 1;

            if (typeof item.upd !== "undefined") {
                stackItem = item.upd.StackObjectsCount;
            }

            // fixed undefined stackobjectscount
            if (stackItem === 1) {
                Object.assign(item, {"upd": {"StackObjectsCount": 1}});
            }

            if (stackItem > body.count) {
                item.upd.StackObjectsCount = stackItem - body.count;
            } else {
                item.splice(item, 1);
            }
        }

        // To item
        if (item._id === body.with) {
            let stackItemWith = 1;

            if (typeof item.upd !== "undefined") {
                stackItemWith = item.upd.StackObjectsCount;
            }

            if (stackItemWith === 1) {
                Object.assign(item, {"upd": {"StackObjectsCount": 1}});
            }

            item.upd.StackObjectsCount = stackItemWith + body.count;
        }
    }

    return output;
}

/* Swap Item
* its used for "reload" if you have weapon in hands and magazine is somewhere else in rig or backpack in equipment
* */
function swapItem(pmcData, body, sessionID) {
    item.resetOutput();

    let output = item.getOutput();

    for (let item of pmcData.Inventory.items) {
        if (item._id === body.item) {
            item.parentId = body.to.id;         // parentId
            item.slotId = body.to.container;    // slotId
            item.location = body.to.location    // location
        }

        if (item._id === body.item2) {
            item.parentId = body.to2.id;
            item.slotId = body.to2.container;
            delete item.location;
        }
    }
    
    return output;
}

/* Give Item
* its used for "add" item like gifts etc.
* */
function addItem(pmcData, body, output, sessionID, foundInRaid = false) {
    let PlayerStash = itm_hf.getPlayerStash(sessionID);
    let stashY = PlayerStash[1];
    let stashX = PlayerStash[0];
    let tmpTraderAssort = assort_f.get(body.tid, sessionID);

    for (let item of tmpTraderAssort.data.items) {
        if (item._id === body.item_id) {
            let MaxStacks = 1;
            let StacksValue = [];
            let tmpItem = itm_hf.getItem(item._tpl)[1];

            // split stacks if the size is higher than allowed by StackMaxSize
            if (body.count > tmpItem._props.StackMaxSize) {
                let count = body.count;
                let calc = body.count - (Math.floor(body.count / tmpItem._props.StackMaxSize) * tmpItem._props.StackMaxSize);
                
                MaxStacks = (calc > 0) ? MaxStacks + Math.floor(count / tmpItem._props.StackMaxSize) : Math.floor(count / tmpItem._props.StackMaxSize);

                for (let sv = 0; sv < MaxStacks; sv++) {
                    if (count > 0) {
                        if (count > tmpItem._props.StackMaxSize) {
                            count = count - tmpItem._props.StackMaxSize;
                            StacksValue[sv] = tmpItem._props.StackMaxSize;
                        } else {
                            StacksValue[sv] = count;
                        }
                    }
                }
            } else {
                StacksValue[0] = body.count;
            }
            // stacks prepared

            for (let stacks = 0; stacks < MaxStacks; stacks++) {
                //update profile on each stack so stash recalculate will have new items
                pmcData = profile_f.getPmcProfile(sessionID);

                let StashFS_2D = itm_hf.recheckInventoryFreeSpace(pmcData, sessionID);
                let ItemSize = itm_hf.getSize(item._tpl, item._id, tmpTraderAssort.data.items);
                let tmpSizeX = ItemSize[0];
                let tmpSizeY = ItemSize[1];

                addedProperly:
                    for (let y = 0; y <= stashY - tmpSizeY; y++) {
                        for (let x = 0; x <= stashX - tmpSizeX; x++) {
                            let badSlot = "no";
                            break_BadSlot:
                                for (let itemY = 0; itemY < tmpSizeY; itemY++) {
                                    for (let itemX = 0; itemX < tmpSizeX; itemX++) {
                                        if (StashFS_2D[y + itemY][x + itemX] !== 0) {
                                            badSlot = "yes";
                                            break break_BadSlot;
                                        }
                                    }
                                }
                            if (badSlot === "yes") {
                                continue;
                            }

                            logger.logInfo("Item placed at position [" + x + "," + y + "]", "", "", true);
                            let newItem = utility.generateNewItemId();
                            let toDo = [[item._id, newItem]];
                            let upd = {"StackObjectsCount": StacksValue[stacks]};

                            // hideout items need to be marked as found in raid
                            if (foundInRaid) {
                                upd["SpawnedInSession"] = true;
                            }

                            output.data.items.new.push({
                                "_id": newItem,
                                "_tpl": item._tpl,
                                "parentId": pmcData.Inventory.stash,
                                "slotId": "hideout",
                                "location": {"x": x, "y": y, "r": 0},
                                "upd": upd
                            });

                            pmcData.Inventory.items.push({
                                "_id": newItem,
                                "_tpl": item._tpl,
                                "parentId": pmcData.Inventory.stash,
                                "slotId": "hideout",
                                "location": {"x": x, "y": y, "r": 0},
                                "upd": upd
                            });

                            while (true) {
                                if (typeof toDo[0] === "undefined") {
                                    break;
                                }

                                for (let tmpKey in tmpTraderAssort.data.items) {
                                    if (tmpTraderAssort.data.items[tmpKey].parentId && tmpTraderAssort.data.items[tmpKey].parentId === toDo[0][0]) {
                                        newItem = utility.generateNewItemId();
                                        let SlotID = tmpTraderAssort.data.items[tmpKey].slotId;
                                        if (SlotID === "hideout") {
                                            output.data.items.new.push({
                                                "_id": newItem,
                                                "_tpl": tmpTraderAssort.data.items[tmpKey]._tpl,
                                                "parentId": toDo[0][1],
                                                "slotId": SlotID,
                                                "location": {"x": x, "y": y, "r": "Horizontal"},
                                                "upd": upd
                                            });

                                            pmcData.Inventory.items.push({
                                                "_id": newItem,
                                                "_tpl": tmpTraderAssort.data.items[tmpKey]._tpl,
                                                "parentId": toDo[0][1],
                                                "slotId": tmpTraderAssort.data.items[tmpKey].slotId,
                                                "location": {"x": x, "y": y, "r": "Horizontal"},
                                                "upd": upd
                                            });
                                        } else {
                                            output.data.items.new.push({
                                                "_id": newItem,
                                                "_tpl": tmpTraderAssort.data.items[tmpKey]._tpl,
                                                "parentId": toDo[0][1],
                                                "slotId": SlotID,
                                                "upd": upd
                                            });

                                            pmcData.Inventory.items.push({
                                                "_id": newItem,
                                                "_tpl": tmpTraderAssort.data.items[tmpKey]._tpl,
                                                "parentId": toDo[0][1],
                                                "slotId": tmpTraderAssort.data.items[tmpKey].slotId,
                                                "upd": upd
                                            });
                                        }

                                        toDo.push([tmpTraderAssort.data.items[tmpKey]._id, newItem]);
                                    }
                                }

                                toDo.splice(0, 1);
                            }

                            break addedProperly;
                        }
                    }
            }

            return output;
        }
    }

    return "";
}

module.exports.moveItem = moveItem;
module.exports.removeItemFromProfile = removeItemFromProfile;
module.exports.removeItem = removeItem;
module.exports.discardItem = discardItem;
module.exports.splitItem = splitItem;
module.exports.mergeItem = mergeItem;
module.exports.transferItem = transferItem;
module.exports.swapItem = swapItem;
module.exports.addItem = addItem;