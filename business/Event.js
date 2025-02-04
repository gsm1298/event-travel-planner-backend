import { Organization } from '../business/Organization.js';
import { DB } from '../data_access/DB.js';

/**
 * @Class Event
 */
export class Event {
    /**
     * @constructor
     * @param {Integer} id
     * @param {String} name
     * @param {Integer} createdBy
     * @param {Integer} financeMan
     * @param {Date} startDate
     * @param {Date} endDate
     * @param {Organization} org
     * @param {String} inviteLink
     * @param {String} description
     * @param {String} pictureLink
     * @param {Integer} maxBudget
     * @param {Integer} currentBudget
     */
    
    constructor(id = null, name = null, createdBy = null, financeMan = null, startDate = null, endDate = null, org = null, inviteLink = null, description = null, pictureLink = null, maxBudget = null, currentBudget = null){
        this.id = id;
        this.name = name;
        this.createdBy = createdBy;
        this.financeMan = financeMan;
        this.startDate = startDate;
        this.endDate = endDate;
        this.org = org;
        this.inviteLink = inviteLink;
        this.description = description;
        this.pictureLink = pictureLink;
        this.maxBudget = maxBudget;
        this.currentBudget = currentBudget;
    }
    
}