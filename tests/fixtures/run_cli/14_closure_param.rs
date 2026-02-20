fn apply(f: fn(i32) -> i32, x: i32) -> i32 {
    f(x)
}

fn main() {
    let add_one = |y| y + 1;
    let _z = apply(add_one, 41);
}
