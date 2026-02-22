fn main() {
    let v = vec![1];
    let _x = v.pop();
    let y = v.pop();
    let out = match y {
        Option::None => -1,
        _ => 0,
    };
    println!("{}", out);
}
