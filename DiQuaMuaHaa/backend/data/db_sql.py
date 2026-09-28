"""Small dialect boundary. Identifiers come from code, never request payloads."""
import re


def _identifier(value):
    if not re.fullmatch(r"[a-z_][a-z0-9_]*", value):
        raise ValueError("Invalid SQL identifier")
    return value


def upsert_row(cur, table, columns, values, keys, updates, *, postgres, increments=()):
    table = _identifier(table)
    for name in (*columns, *keys, *updates):
        _identifier(name)
    sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({', '.join(['%s'] * len(columns))})"
    assignments = []
    for column in updates:
        incoming = f"EXCLUDED.{column}" if postgres else f"VALUES({column})"
        value = f"{table}.{column} + {incoming}" if column in increments else incoming
        assignments.append(f"{column} = {value}")
    clause = f" ON CONFLICT ({', '.join(keys)}) DO UPDATE SET " if postgres else " ON DUPLICATE KEY UPDATE "
    cur.execute(sql + clause + ", ".join(assignments), values)


def insert_id(cur, sql, values, id_column, *, postgres):
    id_column = _identifier(id_column)
    cur.execute(sql + (f" RETURNING {id_column}" if postgres else ""), values)
    return int(cur.fetchone()[id_column] if postgres else cur.lastrowid)
