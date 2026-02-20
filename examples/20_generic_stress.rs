fn id<T>(x: T) -> T {
    x
}

fn pick_left<T, U>(left: T, _right: U) -> T {
    left
}

fn pick_right<T, U>(_left: T, right: U) -> U {
    right
}

fn main() {
    let a = id::<i32>(40);
    let b = id(a + 2);
    let c = pick_left::<i32, i32>(b, 999);
    let d = pick_right::<i32, i32>(0, c + 1);
    println!("{} {}", c, d);
}
