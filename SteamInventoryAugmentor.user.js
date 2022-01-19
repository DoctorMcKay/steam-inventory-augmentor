// ==UserScript==
// @name         Steam Inventory Augmentor
// @namespace    https://www.doctormckay.com/
// @version      2.1.0
// @description  Add "duplicate" tag to items in Steam inventories, and one-click gemifying
// @author       Dr. McKay
// @match        *://steamcommunity.com/*/*/inventory
// @match        *://steamcommunity.com/*/*/inventory/*
// @grant        none
// ==/UserScript==

(function() {
	if (!window.CInventory) {
		return;
	}

	var origReadTags = window.CInventory.prototype.ReadTags;
	window.CInventory.prototype.ReadTags = function() {
		origReadTags.apply(this, arguments);
		if (!this.tags) {
			return;
		}

		this.tags.misc = this.tags.misc || {"name": "Misc", "tags": {}};
		this.tags.misc.tags._duplicate = {"name": "Duplicate", "internal_name": "_duplicate", "count": getDupeCount(this)};
	};

	var origMatchItemTags = window.Filter.MatchItemTags;
	window.Filter.MatchItemTags = function(elItem, rgTags) {
		// Clone arguments or else we'll affect subsequent calls to MatchItemTags
		var args = Array.prototype.slice.call(arguments);
		args[1] = Array.prototype.slice.call(args[1]);

		// Check if "_duplicate" appears in the tag list we're looking for
		var idx = args[1].indexOf("_duplicate");
		if (idx > -1) {
			// If it does, remove it because it's not *actually* a tag
			args[1].splice(idx, 1);
		}

		// Apply the original MatchItemTags filter, but if--after removing "_duplicate"--we have no tags, just return true for now
		// since MatchItemTags returns false if empty.
		var matched = args[1].length == 0 || origMatchItemTags.apply(this, args);

		// If we're looking for dupes, apply that filter on our own. But only if this item belongs to the active inventory
		if (idx > -1 && doesItemBelongToInventory(window.g_ActiveInventory, elItem.rgItem)) {
			// But first, tag dupes if we haven't done so already.
			tagDupes(window.g_ActiveInventory);
			matched = matched && getItemFromInventory(window.g_ActiveInventory, elItem.rgItem)._dupe;
		}

		return matched;
	};

	function doesItemBelongToInventory(inventory, item) {
		return item.appid == inventory.appid && (inventory.contextid == 0 || item.contextid == inventory.contextid);
	}

	function getItemFromInventory(inventory, item) {
		if (inventory.contextid == item.contextid) {
			return inventory.m_rgAssets[item.assetid];
		} else {
			return getItemFromInventory(inventory.m_rgChildInventories[item.contextid], item);
		}
	}

	function tagDupes(inventory, classids) {
		if (inventory._dupesTagged) {
			return;
		}

		classids = classids || {};
		var i;
		for (i in inventory.m_rgAssets) {
			if (!inventory.m_rgAssets.hasOwnProperty(i)) {
				continue;
			}

			if (classids[inventory.m_rgAssets[i].classid]) {
				inventory.m_rgAssets[i]._dupe = true;
			} else {
				classids[inventory.m_rgAssets[i].classid] = true;
			}
		}

		if (inventory.m_rgChildInventories) {
			for (i in inventory.m_rgChildInventories) {
				tagDupes(inventory.m_rgChildInventories[i], classids);
			}
		}

		inventory._dupesTagged = true;
	}

	function getDupeCount(inventory) {
		tagDupes(inventory);
		var count = 0;
		for (var i in inventory.m_rgAssets) {
			if (!inventory.m_rgAssets.hasOwnProperty(i)) {
				continue;
			}

			if (inventory.m_rgAssets[i]._dupe) {
				count++;
			}
		}
		return count;
	}

	// One-click gemifying
	window.GrindIntoGoo = function(appid, contextid, itemid) {
		var ajaxParams = {
			"sessionid": window.g_sessionID,
			"appid": appid,
			"contextid": contextid,
			"assetid": itemid
		};

		window.$J.get(window.g_strProfileURL + "/ajaxgetgoovalue/", ajaxParams).done(function(data) {
			ajaxParams.goo_value_expected = data.goo_value;
			window.$J.post(window.g_strProfileURL + "/ajaxgrindintogoo/", ajaxParams).done(function(data) {
				$J('#753_6_' + itemid).addClass('mckay_plus_gems').attr('data-gemcount', ajaxParams.goo_value_expected);
			}).fail(function(xhr) {
				if (xhr.responseJSON && xhr.responseJSON.message) {
					window.ShowAlertDialog('Action Failed', xhr.responseJSON.message);
				} else {
					window.ShowAlertDialog('Action Failed', 'There was an error communicating with the network. Please try again later.');
				}
			});
		}).fail(function(xhr) {
			if (xhr.responseJSON && xhr.responseJSON.message) {
				window.ShowAlertDialog('Action Failed', xhr.responseJSON.message);
			} else {
				window.ShowAlertDialog('Action Failed', 'There was an error communicating with the network. Please try again later.');
			}
		});
	};

	var node = document.createElement('style');
	node.innerHTML = '.mckay_plus_gems:before {display:block;position:absolute;content:"+" attr(data-gemcount) " GEMS";color:#FFF;text-align:center;font-size:16px;width:100%;font-family:"Motiva Sans Light", Arial, Helvetica, sans-serif;padding-top:30px;} .mckay_plus_gems > img {opacity:0.2;}';
	document.body.appendChild(node);

    // Multi-sell links
    var origPopulateMarketActions = window.PopulateMarketActions;
    window.PopulateMarketActions = function(elActions, item) {
        origPopulateMarketActions.apply(this, arguments);

        // Delay by 1 second to account for fade transition
        setTimeout(() => {
            if (!item.description || !item.description.marketable || !item.description.market_hash_name || !item.description.commodity) {
                return; // not marketable or not a commodity item
            }

            // If we have more than one of this item in our inventory, we want to add a multi-sell link
            var count = Object.keys(window.g_ActiveInventory.m_rgAssets).filter(id => window.g_ActiveInventory.m_rgAssets[id].description.market_hash_name == item.description.market_hash_name && window.g_ActiveInventory.m_rgAssets[id].description.marketable).length;
            if (count > 1) {
                var insertBefore = $J('.item_market_actions:visible>div>div')[1];
                var link = $J('<div style="height: 24px"><a href="https://steamcommunity.com/market/multisell?appid=' + item.appid + '&contextid=' + item.contextid + '&items[]=' + encodeURIComponent(item.description.market_hash_name) + '">Sell Multiple</a></div>')[0];
                insertBefore.parentNode.insertBefore(link, insertBefore);
            }
        }, 1000);
    }
})();
