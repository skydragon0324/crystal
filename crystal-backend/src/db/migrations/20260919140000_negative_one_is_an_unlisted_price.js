'use strict';

/** Allow the one documented hidden-price sentinel, without admitting other
 * negative prices. */
exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_price_check;
    ALTER TABLE products ADD CONSTRAINT products_price_check CHECK (price >= -1)
  `);
};

exports.down = async function down(knex) {
  const hidden = await knex('products').where('price', -1).count({ count: '*' }).first();
  if (Number(hidden.count)) {
    throw new Error('Cannot restore the non-negative price constraint while products use the -1 hidden-price sentinel');
  }
  await knex.raw(`
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_price_check;
    ALTER TABLE products ADD CONSTRAINT products_price_check CHECK (price >= 0)
  `);
};
