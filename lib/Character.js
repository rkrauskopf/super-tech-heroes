'use strict';

const util = require('./util');
const validate = require('./validate');
const Response = require('./Response');
const Url = require('url');
const log = require('./log');

/**
 * Represents a single character from the database.
 */
class Character {
  constructor ({ id, name, normalizedName, type, powers, weakness, bio, user, expires, sidekick, nemesis }) {
    this.id = id || '';
    this.name = name || '';
    this.normalizedName = normalizedName || '';
    this.type = type || '';
    this.powers = powers || [];
    this.weakness = weakness || '';
    this.bio = bio || '';
    this.user = user || '';
    this.expires = expires || 0;

    this.sidekick = Character.fromRelation(sidekick, 'sidekick');
    this.nemesis = Character.fromRelation(nemesis, 'villain');
  }

  /**
   * Creates a {@link Character} object from an existing Character's "sidekick" or "nemesis"
   * property, which may be an object, a string, or null. If it's a string, it may be the related
   * character's ID or URL.
   *
   * @param {string|object} value - The related character or ID
   * @param {string} type - The type of relation (e.g. "sidekick", "nemesis")
   * @returns {?Character}
   */
  static fromRelation (value, type) {
    if (!value) {
      return null;
    }
    else if (typeof value === 'object') {
      return new Character(Object.assign({ type }, value));
    }
    else if (typeof value === 'string') {
      if (validate.isGuid(value)) {
        return new Character({ id: value, type });
      }
      else {
        return Character.fromUrl(value, type);
      }
    }
    else {
      throw Response.badRequest(`The "${type}" value must be a string or object`);
    }
  }

  /**
   * Creates a {@link Character} object from a URL (e.g. "http://heroes.com/characters/supercoder").
   * Only the {@link Character#normalizedName} property will be set.
   *
   * @param {string} url - The character URL
   * @param {string} type - The character type (e.g. "sidekick", "nemesis")
   * @returns {Character}
   */
  static fromUrl (url, type) {
    try {
      // Parse the URL
      url = Url.parse(url);

      // Extract the character's normalized name from the URL path
      let pathParts = /^\/characters\/([a-z0-9]+)$/i.exec(url.pathname);

      if (pathParts) {
        let normalizedName = pathParts[1].toLowerCase();
        return new Character({ normalizedName, type });
      }
    }
    catch (error) {
      log.error(error);
    }

    // If we get here, then the URL was invalid
    throw Response.pathNotFound(`The "${type}" URL is not valid`);
  }

  /**
   * Returns the character as a database model
   *
   * @returns {object}
   */
  toModel () {
    // Validate all the properties that are needed for a model
    this.validate({ model: true });

    // These fields always exist
    let model = {
      id: this.id,
      name: this.name,
      normalizedName: this.normalizedName,
      type: this.type,
      user: this.user,
      expires: this.expires,
    };

    // These fields only exist if they have values
    this.powers.length && (model.powers = this.powers);
    this.weakness && (model.weakness = this.weakness);
    this.bio && (model.bio = this.bio);

    // These fields only exist for heroes
    if (this.type === 'hero') {
      this.sidekick && (model.sidekick = this.sidekick.id);
      this.nemesis && (model.nemesis = this.nemesis.id);
    }

    return model;
  }

  /**
   * Returns the character as a REST resource, with HATEOAS links
   *
   * @param {object} [request] - The incoming HTTP request
   * @returns {object}
   */
  toResource (request) {
    // Validate all the properties that are needed for a REST resource
    this.validate({ resource: true });

    // These fields always exist
    let resource = {
      id: this.id,
      name: this.name,
      type: this.type,
    };

    // These fields only exist if they have values
    this.powers.length && (resource.powers = this.powers);
    this.weakness && (resource.weakness = this.weakness);
    this.bio && (resource.bio = this.bio);

    // Add HATEOAS links (absolute URLs if we have a request, otherwise relative URLs)
    let hostname = request ? util.getHostName(request) : '';
    resource.links = {
      self: `${hostname}/characters/${this.normalizedName}`,
    };

    // These HATEOAS links only exist for heroes
    if (this.sidekick) {
      resource.links.sidekick = `${hostname}/characters/${this.sidekick.normalizedName}`;
    }
    if (this.nemesis) {
      resource.links.nemesis = `${hostname}/characters/${this.nemesis.normalizedName}`;
    }

    return resource;
  }

  /**
   * Throws an error if any fields are invalid.
   *
   * @param {boolean} [validate.model] - Validate fields that are only required for database models
   * @param {boolean} [validate.resource] - Validate fields that are only required for REST resources
   */
  validate ({ model = false, resoure = false } = {}) {
    validate.guid('id', this.id);

    validate.nonEmptyString('name', this.name);
    validate.maxLength('name', this.name, 50);

    validate.nonEmptyString('type', this.type);
    validate.oneOf('type', this.type, ['hero', 'sidekick', 'villain']);

    if (this.sidekick) {
      if (this.type !== 'hero') {
        throw Response.badRequest('Only heroes can have sidekicks');
      }
      else if (this.sidekick.type !== 'sidekick') {
        throw Response.badRequest('The "sidekick.type" value must be "sidekick"');
      }
    }

    if (this.nemesis) {
      if (this.type !== 'hero') {
        throw Response.badRequest('Only heroes can have nemesis');
      }
      else if (this.nemesis.type !== 'villain') {
        throw Response.badRequest('The "nemesis.type" value must be "villain"');
      }
    }

    // These properties are only needed for database models
    if (model) {
      validate.nonEmptyString('normalizedName', this.normalizedName);
      validate.maxLength('normalizedName', this.normalizedName, 50);

      validate.user(this.user);
      validate.positiveInteger('expires', this.expires);

      if (this.sidekick) {
        validate.guid('sidekick.id', this.sidekick.id);
      }
      if (this.nemesis) {
        validate.guid('nemesis.id', this.nemesis.id);
      }
    }

    // These properties are only needed for REST resources
    if (resoure) {
      if (this.sidekick) {
        validate.nonEmptyString('sidekick.normalizedName', this.sidekick.normalizedName);
      }
      if (this.nemesis) {
        validate.nonEmptyString('nemesis.normalizedName', this.nemesis.normalizedName);
      }
    }
  }
}

module.exports = Character;